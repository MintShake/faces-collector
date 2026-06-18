"use client";

import { useEffect, useRef, useState } from "react";
import { useFacesAuth } from "./auth-context";

const TOKEN_CONTRACT = "0xa199Ab829b992FD357E40F1E91be724D7273aa82";
const TOKEN_DECIMALS = 18n;
const PRESETS = [100, 500, 1000, 5000];
const BASE_CHAIN_ID = "0x2105"; // 8453

type Status = "idle" | "pending" | "sent" | "error";

type SwapQuote = {
  ok: true;
  to: string;
  calldata: string;
  value: string;
  ethToSpend: string;
  recipientAddress: string;
  fee: number;
  priceUsd: number | null;
};

export function TipButton({ fid, recipientName }: { fid: number; recipientName: string }) {
  const { identity, openConnect } = useFacesAuth();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(100);
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState<string>();
  const [tokenPrice, setTokenPrice] = useState<number>();
  const [recipientAddress, setRecipientAddress] = useState<string>();
  const [addressLoading, setAddressLoading] = useState(false);
  const [userBalance, setUserBalance] = useState<bigint | null>(null);
  const [swapQuote, setSwapQuote] = useState<SwapQuote | null>(null);
  const [swapLoading, setSwapLoading] = useState(false);
  const swapAbort = useRef<AbortController | null>(null);

  // Fetch recipient wallet when panel opens.
  useEffect(() => {
    if (!open || recipientAddress) return;
    setAddressLoading(true);
    fetch(`/api/faces/${fid}/wallet`)
      .then((r) => r.json())
      .then((data: { ok: boolean; addresses?: string[] }) => {
        if (data.ok && data.addresses?.[0]) setRecipientAddress(data.addresses[0]);
        else setErrorMsg("This profile hasn't linked a wallet to Farcaster.");
      })
      .catch(() => setErrorMsg("Could not look up wallet address."))
      .finally(() => setAddressLoading(false));
  }, [open, fid, recipientAddress]);

  // Fetch live token price (USD) when panel opens.
  useEffect(() => {
    if (!open) return;
    fetch(`https://api.dexscreener.com/latest/dex/tokens/${TOKEN_CONTRACT}`)
      .then((r) => r.json())
      .then((data: { pairs?: Array<{ priceUsd?: string }> }) => {
        const price = parseFloat(data.pairs?.[0]?.priceUsd ?? "");
        if (!isNaN(price)) setTokenPrice(price);
      })
      .catch(() => {});
  }, [open]);

  // Fetch user's FACES balance when panel opens and identity is wallet.
  useEffect(() => {
    if (!open || identity?.kind !== "wallet") return;
    const eth = getEthereum();
    if (!eth) return;
    const data = "0x70a08231" + identity.address.replace(/^0x/i, "").toLowerCase().padStart(64, "0");
    eth.request({ method: "eth_call", params: [{ to: TOKEN_CONTRACT, data }, "latest"] })
      .then((hex) => setUserBalance(BigInt((hex as string) || "0x0")))
      .catch(() => setUserBalance(null));
  }, [open, identity]);

  const rawAmount = BigInt(amount) * 10n ** TOKEN_DECIMALS;
  const needsToBuy = identity?.kind === "wallet" && userBalance !== null && userBalance < rawAmount;
  const balanceReadable = userBalance !== null ? Number(userBalance / 10n ** 16n) / 100 : null;
  const usdFor = (n: number) => tokenPrice ? `≈ $${(n * tokenPrice).toFixed(2)}` : null;

  // Fetch swap quote whenever balance is insufficient.
  useEffect(() => {
    if (!open || !needsToBuy || !recipientAddress) return;
    swapAbort.current?.abort();
    const ctrl = new AbortController();
    swapAbort.current = ctrl;
    setSwapLoading(true);
    setSwapQuote(null);
    fetch(`/api/faces/token/swap-quote?fid=${fid}&amount=${amount}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((data: SwapQuote | { ok: false; error: string }) => {
        if (data.ok) setSwapQuote(data as SwapQuote);
        // else: no pool — swap unavailable, swapQuote stays null
      })
      .catch((err) => { if (err.name !== "AbortError") setSwapQuote(null); })
      .finally(() => setSwapLoading(false));
    return () => ctrl.abort();
  }, [open, needsToBuy, amount, fid, recipientAddress]);

  async function handleSend() {
    if (!identity) { openConnect(); return; }
    if (identity.kind !== "wallet") { setErrorMsg("Connect a wallet to send tokens."); setStatus("error"); return; }
    if (!recipientAddress) { setErrorMsg("No wallet address found for this profile."); setStatus("error"); return; }

    const eth = getEthereum();
    if (!eth) { setErrorMsg("No wallet found."); setStatus("error"); return; }

    setStatus("pending");
    setErrorMsg(undefined);

    try {
      await switchToBase(eth);

      // Re-check balance after chain switch.
      const balData = "0x70a08231" + identity.address.replace(/^0x/i, "").toLowerCase().padStart(64, "0");
      const balHex = await eth.request({ method: "eth_call", params: [{ to: TOKEN_CONTRACT, data: balData }, "latest"] }) as string;
      const currentBalance = BigInt(balHex || "0x0");
      setUserBalance(currentBalance);

      if (currentBalance >= rawAmount) {
        // Sufficient balance — direct ERC-20 transfer.
        await eth.request({
          method: "eth_sendTransaction",
          params: [{ from: identity.address, to: TOKEN_CONTRACT, data: encodeERC20Transfer(recipientAddress, rawAmount) }]
        });
      } else {
        // Insufficient balance — swap ETH → FACES directly to recipient via Uniswap.
        let quote = swapQuote;
        if (!quote) {
          // Fetch on demand if not already loaded.
          const res = await fetch(`/api/faces/token/swap-quote?fid=${fid}&amount=${amount}`);
          const data = await res.json() as SwapQuote | { ok: false; error: string };
          if (!("ok" in data) || !data.ok) throw new Error((data as { error: string }).error ?? "Swap quote failed");
          quote = data as SwapQuote;
        }
        await eth.request({
          method: "eth_sendTransaction",
          params: [{
            from: identity.address,
            to: quote.to,
            data: quote.calldata,
            value: quote.value
          }]
        });
      }

      setStatus("sent");
      setOpen(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.toLowerCase().includes("rejected") || msg.toLowerCase().includes("denied")) {
        setStatus("idle");
      } else {
        setErrorMsg(msg.length < 120 ? msg : "Transaction failed — check your wallet and try again.");
        setStatus("error");
      }
    }
  }

  if (status === "sent") return <span className="tipSent">Tip sent to {recipientName}!</span>;

  if (!open) {
    return (
      <button type="button" className="tipButton" onClick={() => setOpen(true)}>
        Tip Faces token
      </button>
    );
  }

  const ethHint = swapQuote
    ? `~${trimEth(swapQuote.ethToSpend)} ETH`
    : swapLoading
    ? "…"
    : null;

  return (
    <div className="tipPanel">
      <div className="tipHeader">
        <span>Tip <strong>{recipientName}</strong></span>
        {tokenPrice && <span className="tipPrice">1 FACES = ${tokenPrice.toFixed(6)}</span>}
      </div>

      {addressLoading && <p className="tipHint">Looking up wallet…</p>}

      {recipientAddress && (
        <>
          {balanceReadable !== null && (
            <p className="tipHint">
              Your balance: <strong>{balanceReadable.toLocaleString()} FACES</strong>
              {needsToBuy && ethHint && (
                <span className="tipBuyHint"> · buy &amp; send for {ethHint} ETH</span>
              )}
            </p>
          )}

          <div className="tipPresets">
            {PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                className={amount === p ? "tipPreset active" : "tipPreset"}
                onClick={() => setAmount(p)}
              >
                <span>{p.toLocaleString()}</span>
                {usdFor(p) && <small>{usdFor(p)}</small>}
              </button>
            ))}
          </div>

          <div className="tipInputRow">
            <input
              type="number"
              className="tipCustom"
              min={1}
              value={amount}
              onChange={(e) => setAmount(Math.max(1, Number(e.target.value) || 1))}
              aria-label="Tip amount in FACES"
            />
            <span className="tipUnit">FACES</span>
            {usdFor(amount) && <span className="tipUsd">{usdFor(amount)}</span>}
          </div>
        </>
      )}

      {errorMsg && <p className="tipError">{errorMsg}</p>}

      {!addressLoading && recipientAddress && (
        <div className="tipActions">
          <button
            type="button"
            className="primaryButton"
            onClick={handleSend}
            disabled={status === "pending" || swapLoading || (needsToBuy && !swapQuote && !swapLoading)}
          >
            {status === "pending"
              ? needsToBuy ? "Buying & sending…" : "Sending…"
              : needsToBuy && swapLoading
              ? "Getting price…"
              : needsToBuy && !swapQuote
              ? "No liquidity pool yet"
              : needsToBuy
              ? `Send ${amount.toLocaleString()} FACES · ${ethHint} ETH`
              : `Send ${amount.toLocaleString()} FACES`}
          </button>
          <button type="button" className="textButton" onClick={() => { setOpen(false); setStatus("idle"); setErrorMsg(undefined); }}>
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

function encodeERC20Transfer(to: string, amount: bigint): string {
  const selector = "a9059cbb";
  const paddedTo = to.replace(/^0x/i, "").toLowerCase().padStart(64, "0");
  const paddedAmount = amount.toString(16).padStart(64, "0");
  return `0x${selector}${paddedTo}${paddedAmount}`;
}

async function switchToBase(eth: EthereumProvider) {
  try {
    await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: BASE_CHAIN_ID }] });
  } catch (err) {
    if ((err as { code?: number }).code === 4902) {
      await eth.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId: BASE_CHAIN_ID,
          chainName: "Base",
          nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
          rpcUrls: ["https://mainnet.base.org"],
          blockExplorerUrls: ["https://basescan.org"]
        }]
      });
    } else {
      throw err;
    }
  }
}

function getEthereum(): EthereumProvider | undefined {
  return (window as unknown as { ethereum?: EthereumProvider }).ethereum;
}

// Trim trailing zeros from ETH decimal string for display.
function trimEth(s: string): string {
  const n = parseFloat(s);
  if (isNaN(n)) return s;
  // Show 6 sig figs, remove trailing zeros.
  return n.toPrecision(4).replace(/\.?0+$/, "");
}

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};
