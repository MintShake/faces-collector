"use client";

import { useEffect, useState } from "react";
import { useFacesAuth } from "./auth-context";

const TOKEN_CONTRACT = "0xa199Ab829b992FD357E40F1E91be724D7273aa82";
const TOKEN_DECIMALS = 18n;
const PRESETS = [100, 500, 1000, 5000];
const BASE_CHAIN_ID = "0x2105"; // 8453

type Status = "idle" | "pending" | "sent" | "error";

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

  // Fetch live token price when panel opens.
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
    const eth = (window as unknown as { ethereum?: EthereumProvider }).ethereum;
    if (!eth) return;

    const balanceData = "0x70a08231" + identity.address.replace(/^0x/i, "").toLowerCase().padStart(64, "0");
    eth.request({ method: "eth_call", params: [{ to: TOKEN_CONTRACT, data: balanceData }, "latest"] })
      .then((hex) => setUserBalance(BigInt((hex as string) || "0x0")))
      .catch(() => setUserBalance(null));
  }, [open, identity]);

  const usdFor = (n: number) => tokenPrice ? `≈ $${(n * tokenPrice).toFixed(2)}` : null;
  const rawAmount = BigInt(amount) * 10n ** TOKEN_DECIMALS;
  const needsToBuy = userBalance !== null && userBalance < rawAmount;
  const balanceReadable = userBalance !== null ? Number(userBalance / 10n ** 16n) / 100 : null;

  function uniswapBuyUrl(qty: number) {
    return `https://app.uniswap.org/swap?inputCurrency=ETH&outputCurrency=${TOKEN_CONTRACT}&outputAmount=${qty}&chain=base`;
  }

  async function sendTip() {
    if (!identity) { openConnect(); return; }
    if (identity.kind !== "wallet") { setErrorMsg("Connect a wallet to send tokens."); setStatus("error"); return; }
    if (!recipientAddress) { setErrorMsg("No wallet address found for this profile."); setStatus("error"); return; }

    const eth = (window as unknown as { ethereum?: EthereumProvider }).ethereum;
    if (!eth) { setErrorMsg("No wallet found."); setStatus("error"); return; }

    setStatus("pending");
    setErrorMsg(undefined);

    try {
      // Switch to Base.
      try {
        await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: BASE_CHAIN_ID }] });
      } catch (switchErr) {
        if ((switchErr as { code?: number }).code === 4902) {
          await eth.request({
            method: "wallet_addEthereumChain",
            params: [{ chainId: BASE_CHAIN_ID, chainName: "Base", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: ["https://mainnet.base.org"], blockExplorerUrls: ["https://basescan.org"] }]
          });
        } else { throw switchErr; }
      }

      // Re-check balance after chain switch.
      const balData = "0x70a08231" + identity.address.replace(/^0x/i, "").toLowerCase().padStart(64, "0");
      const balHex = await eth.request({ method: "eth_call", params: [{ to: TOKEN_CONTRACT, data: balData }, "latest"] }) as string;
      const bal = BigInt(balHex || "0x0");
      setUserBalance(bal);

      if (bal < rawAmount) {
        const readable = Number(bal / 10n ** 16n) / 100;
        setErrorMsg(`You have ${readable.toLocaleString()} FACES — not enough for this tip.`);
        setStatus("idle");
        return;
      }

      // Send ERC-20 transfer.
      await eth.request({
        method: "eth_sendTransaction",
        params: [{ from: identity.address, to: TOKEN_CONTRACT, data: encodeERC20Transfer(recipientAddress, rawAmount) }]
      });

      setStatus("sent");
      setOpen(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.toLowerCase().includes("rejected") || msg.toLowerCase().includes("denied")) {
        setStatus("idle");
      } else {
        setErrorMsg("Transaction failed — check your wallet and try again.");
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

  return (
    <div className="tipPanel">
      <div className="tipHeader">
        <span>Tip <strong>{recipientName}</strong></span>
        {tokenPrice && <span className="tipPrice">1 FACES = ${tokenPrice.toFixed(6)}</span>}
      </div>

      {addressLoading && <p className="tipHint">Looking up wallet…</p>}

      {recipientAddress && (
        <>
          <p className="tipHint">Sending to {recipientAddress.slice(0, 6)}…{recipientAddress.slice(-4)} on Base</p>

          {balanceReadable !== null && (
            <p className="tipHint">Your balance: <strong>{balanceReadable.toLocaleString()} FACES</strong></p>
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

          {needsToBuy && (
            <div className="tipBuyPrompt">
              <p>You need {(amount - Number(userBalance! / 10n ** 18n)).toLocaleString()} more FACES to send this tip.</p>
              <a
                href={uniswapBuyUrl(amount)}
                target="_blank"
                rel="noreferrer"
                className="tipBuyLink"
              >
                Buy {amount.toLocaleString()} FACES on Uniswap →
              </a>
            </div>
          )}
        </>
      )}

      {errorMsg && <p className="tipError">{errorMsg}</p>}

      {!addressLoading && (
        <div className="tipActions">
          {recipientAddress && !needsToBuy && (
            <button type="button" className="primaryButton" onClick={sendTip} disabled={status === "pending"}>
              {status === "pending" ? "Sending…" : `Send ${amount.toLocaleString()} FACES`}
            </button>
          )}
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

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};
