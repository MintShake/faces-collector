"use client";

import { useEffect, useRef, useState } from "react";
import { useFacesAuth } from "./auth-context";

const FACES_TOKEN = "0xa199Ab829b992FD357E40F1E91be724D7273aa82";
const USDC_TOKEN  = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const TOKEN_DECIMALS = 18n;
const PRESETS = [100, 500, 1000, 5000];
const BASE_CHAIN_ID = "0x2105"; // 8453

type Status = "idle" | "approving" | "pending" | "sent" | "error";

type SwapQuote = {
  ok: true;
  inputToken: "eth" | "usdc";
  to: string;
  calldata: string;
  value: string;
  approveToken: string | null;
  approveAmount: string | null;
  ethToSpend?: string;
  usdcToSpend?: string;
  recipientAddress: string;
  priceUsd: number | null;
};

export function TipButton({ fid, recipientName }: { fid: number; recipientName: string }) {
  const { identity, openConnect } = useFacesAuth();
  const [open, setOpen]           = useState(false);
  const [amount, setAmount]       = useState(100);
  const [status, setStatus]       = useState<Status>("idle");
  const [errorMsg, setErrorMsg]   = useState<string>();

  const [tokenPrice, setTokenPrice]         = useState<number>();
  const [recipientAddress, setRecipientAddress] = useState<string>();
  const [labeledAddresses, setLabeledAddresses] = useState<LabeledAddress[]>([]);
  const [addressLoading, setAddressLoading] = useState(false);

  const [facesBalance, setFacesBalance] = useState<bigint | null>(null);
  const [usdcBalance, setUsdcBalance]   = useState<bigint | null>(null);

  const [swapQuote, setSwapQuote]   = useState<SwapQuote | null>(null);
  const [swapLoading, setSwapLoading] = useState(false);
  const [preferUsdc, setPreferUsdc] = useState(false);

  const swapAbort = useRef<AbortController | null>(null);

  // ── data fetching ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!open || recipientAddress) return;
    setAddressLoading(true);
    fetch(`/api/faces/${fid}/wallet`)
      .then((r) => r.json())
      .then((data: { ok: boolean; addresses?: string[]; labeled?: LabeledAddress[] }) => {
        if (data.ok && data.addresses?.[0]) {
          setRecipientAddress(data.addresses[0]);
          setLabeledAddresses(data.labeled ?? []);
        } else {
          setErrorMsg("This profile hasn't linked a wallet to Farcaster.");
        }
      })
      .catch(() => setErrorMsg("Could not look up wallet address."))
      .finally(() => setAddressLoading(false));
  }, [open, fid, recipientAddress]);

  useEffect(() => {
    if (!open) return;
    fetch(`https://api.dexscreener.com/latest/dex/tokens/${FACES_TOKEN}`)
      .then((r) => r.json())
      .then((data: { pairs?: Array<{ priceUsd?: string }> }) => {
        const p = parseFloat(data.pairs?.[0]?.priceUsd ?? "");
        if (!isNaN(p)) setTokenPrice(p);
      })
      .catch(() => {});
  }, [open]);

  useEffect(() => {
    if (!open || identity?.kind !== "wallet") return;
    const eth = getEthereum();
    if (!eth) return;
    const addr = identity.address.replace(/^0x/i, "").toLowerCase().padStart(64, "0");

    Promise.all([
      eth.request({ method: "eth_call", params: [{ to: FACES_TOKEN, data: "0x70a08231" + addr }, "latest"] }),
      eth.request({ method: "eth_call", params: [{ to: USDC_TOKEN,  data: "0x70a08231" + addr }, "latest"] }),
    ]).then(([facesHex, usdcHex]) => {
      setFacesBalance(BigInt((facesHex as string) || "0x0"));
      setUsdcBalance(BigInt((usdcHex  as string) || "0x0"));
    }).catch(() => {});
  }, [open, identity]);

  // ── swap quote ─────────────────────────────────────────────────────────────

  const rawFacesAmount = BigInt(amount) * 10n ** TOKEN_DECIMALS;
  const needsToBuy = identity?.kind === "wallet" && facesBalance !== null && facesBalance < rawFacesAmount;

  useEffect(() => {
    if (!open || !needsToBuy || !recipientAddress) return;
    swapAbort.current?.abort();
    const ctrl = new AbortController();
    swapAbort.current = ctrl;
    setSwapLoading(true);
    setSwapQuote(null);
    const inputToken = preferUsdc ? "usdc" : "eth";
    fetch(`/api/faces/token/swap-quote?fid=${fid}&amount=${amount}&inputToken=${inputToken}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((data: SwapQuote | { ok: false; error: string }) => {
        if (data.ok) setSwapQuote(data as SwapQuote);
      })
      .catch((e) => { if (e.name !== "AbortError") setSwapQuote(null); })
      .finally(() => setSwapLoading(false));
    return () => ctrl.abort();
  }, [open, needsToBuy, amount, fid, recipientAddress, preferUsdc]);

  // ── derived display values ─────────────────────────────────────────────────

  const facesReadable = facesBalance !== null ? Number(facesBalance / 10n ** 16n) / 100 : null;
  const usdcReadable  = usdcBalance  !== null ? Number(usdcBalance  / 10n ** 4n)  / 100 : null; // USDC 6 dec
  const usdFor = (n: number) => tokenPrice ? `≈ $${(n * tokenPrice).toFixed(2)}` : null;
  const canUseUsdc = usdcBalance !== null && usdcBalance > 0n;

  const ethHint = swapQuote?.inputToken === "eth" && swapQuote.ethToSpend
    ? `~${trimEth(swapQuote.ethToSpend)} ETH`
    : null;
  const usdcHint = swapQuote?.inputToken === "usdc" && swapQuote.usdcToSpend
    ? `~${swapQuote.usdcToSpend} USDC`
    : null;
  const costHint = usdcHint ?? ethHint;

  // ── send logic ─────────────────────────────────────────────────────────────

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

      // Re-check FACES balance.
      const balData  = "0x70a08231" + identity.address.replace(/^0x/i, "").toLowerCase().padStart(64, "0");
      const balHex   = await eth.request({ method: "eth_call", params: [{ to: FACES_TOKEN, data: balData }, "latest"] }) as string;
      const currentBalance = BigInt(balHex || "0x0");
      setFacesBalance(currentBalance);

      if (currentBalance >= rawFacesAmount) {
        // Sufficient FACES — direct ERC-20 transfer.
        await eth.request({
          method: "eth_sendTransaction",
          params: [{ from: identity.address, to: FACES_TOKEN, data: encodeERC20Transfer(recipientAddress, rawFacesAmount) }],
        });
      } else {
        // Need to swap. Fetch quote if not already loaded.
        let quote = swapQuote;
        if (!quote) {
          const inputToken = preferUsdc && canUseUsdc ? "usdc" : "eth";
          const res  = await fetch(`/api/faces/token/swap-quote?fid=${fid}&amount=${amount}&inputToken=${inputToken}`);
          const data = await res.json() as SwapQuote | { ok: false; error: string };
          if (!data.ok) throw new Error((data as { error: string }).error ?? "Swap quote failed");
          quote = data as SwapQuote;
        }

        // If USDC swap, approve first.
        if (quote.approveToken && quote.approveAmount) {
          const allowanceData = "0xdd62ed3e"
            + identity.address.replace(/^0x/i, "").toLowerCase().padStart(64, "0")
            + quote.to.replace(/^0x/i, "").toLowerCase().padStart(64, "0");
          const allowHex = await eth.request({ method: "eth_call", params: [{ to: quote.approveToken, data: allowanceData }, "latest"] }) as string;
          const allowance = BigInt(allowHex || "0x0");
          const needed    = BigInt(quote.approveAmount);

          if (allowance < needed) {
            setStatus("approving");
            // approve(spender, amount)
            const approveData = "0x095ea7b3"
              + quote.to.replace(/^0x/i, "").toLowerCase().padStart(64, "0")
              + needed.toString(16).padStart(64, "0");
            await eth.request({
              method: "eth_sendTransaction",
              params: [{ from: identity.address, to: quote.approveToken, data: "0x" + approveData.replace(/^0x/, "") }],
            });
            setStatus("pending");
          }
        }

        await eth.request({
          method: "eth_sendTransaction",
          params: [{
            from: identity.address,
            to: quote.to,
            data: quote.calldata,
            value: quote.value,
          }],
        });
      }

      setStatus("sent");
      setOpen(false);
      fetch("/api/activity", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subjectFid: fid, subjectDisplayName: recipientName, amount, actorAddress: identity.address }),
      }).catch(() => {});
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

  // ── render ─────────────────────────────────────────────────────────────────

  if (status === "sent") return <span className="tipSent">Tip sent to {recipientName}!</span>;

  if (!open) {
    return (
      <button type="button" className="tipButton" onClick={() => setOpen(true)}>
        Tip Faces token
      </button>
    );
  }

  const sendLabel = () => {
    if (status === "approving") return "Approving USDC…";
    if (status === "pending")   return needsToBuy ? "Buying & sending…" : "Sending…";
    if (needsToBuy && swapLoading) return "Getting price…";
    if (needsToBuy && !swapQuote && !swapLoading) return "No liquidity pool yet";
    if (needsToBuy && costHint) return `Send ${amount.toLocaleString()} FACES · ${costHint}`;
    return `Send ${amount.toLocaleString()} FACES`;
  };

  return (
    <div className="tipPanel">
      <div className="tipHeader">
        <span>Tip <strong>{recipientName}</strong></span>
        {tokenPrice && <span className="tipPrice">1 FACES = ${tokenPrice.toFixed(6)}</span>}
      </div>

      {addressLoading && <p className="tipHint">Looking up wallet…</p>}

      {recipientAddress && (
        <>
          {/* Address selector */}
          {labeledAddresses.length > 1 ? (
            <div className="tipAddressRow">
              <span className="tipAddressLabel">Send to:</span>
              <select
                className="tipAddressSelect"
                value={recipientAddress}
                onChange={(e) => setRecipientAddress(e.target.value)}
              >
                {labeledAddresses.map((l) => (
                  <option key={l.address} value={l.address}>
                    {l.label} · {l.address.slice(0, 6)}…{l.address.slice(-4)}
                  </option>
                ))}
              </select>
            </div>
          ) : recipientAddress && (
            <p className="tipHint">
              {labeledAddresses[0]?.label ?? "Sending to"}{" "}
              <strong>{recipientAddress.slice(0, 6)}…{recipientAddress.slice(-4)}</strong>
              {labeledAddresses[0]?.isVerified && <span className="tipVerifiedBadge"> ✓</span>}
            </p>
          )}

          {/* Balances */}
          <div className="tipBalances">
            {facesReadable !== null && (
              <span className={facesReadable >= amount ? "tipBalancePill ok" : "tipBalancePill low"}>
                {facesReadable.toLocaleString()} FACES
              </span>
            )}
            {usdcReadable !== null && usdcReadable > 0 && (
              <span className="tipBalancePill">
                ${usdcReadable.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC
              </span>
            )}
          </div>

          {/* Input toggle when buying needed */}
          {needsToBuy && canUseUsdc && (
            <div className="tipInputToggle">
              <button
                type="button"
                className={!preferUsdc ? "tipToggleBtn active" : "tipToggleBtn"}
                onClick={() => setPreferUsdc(false)}
              >ETH</button>
              <button
                type="button"
                className={preferUsdc ? "tipToggleBtn active" : "tipToggleBtn"}
                onClick={() => setPreferUsdc(true)}
              >USDC</button>
            </div>
          )}

          {/* Amount presets */}
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
            disabled={status === "pending" || status === "approving" || swapLoading || (needsToBuy && !swapQuote && !swapLoading)}
          >
            {sendLabel()}
          </button>
          <button
            type="button"
            className="textButton"
            onClick={() => { setOpen(false); setStatus("idle"); setErrorMsg(undefined); }}
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

// ── helpers ────────────────────────────────────────────────────────────────

function encodeERC20Transfer(to: string, amount: bigint): string {
  return "0xa9059cbb"
    + to.replace(/^0x/i, "").toLowerCase().padStart(64, "0")
    + amount.toString(16).padStart(64, "0");
}

async function switchToBase(eth: EthereumProvider) {
  try {
    await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: BASE_CHAIN_ID }] });
  } catch (err) {
    if ((err as { code?: number }).code === 4902) {
      await eth.request({
        method: "wallet_addEthereumChain",
        params: [{ chainId: BASE_CHAIN_ID, chainName: "Base", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: ["https://mainnet.base.org"], blockExplorerUrls: ["https://basescan.org"] }],
      });
    } else { throw err; }
  }
}

function getEthereum(): EthereumProvider | undefined {
  return (window as unknown as { ethereum?: EthereumProvider }).ethereum;
}

function trimEth(s: string): string {
  const n = parseFloat(s);
  return isNaN(n) ? s : n.toPrecision(4).replace(/\.?0+$/, "");
}

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

type LabeledAddress = {
  address: string;
  label: string;
  isVerified: boolean;
};
