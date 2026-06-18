"use client";

import { useEffect, useState } from "react";
import { useFacesAuth } from "./auth-context";

const TOKEN_CONTRACT = "0xa199Ab829b992FD357E40F1E91be724D7273aa82";
const TOKEN_DECIMALS = 18n;
const PRESETS = [100, 500, 1000, 5000];

type Status = "idle" | "pending" | "sent" | "error";

export function TipButton({
  fid,
  recipientName
}: {
  fid: number;
  recipientName: string;
}) {
  const { identity, openConnect } = useFacesAuth();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(100);
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState<string>();
  const [tokenPrice, setTokenPrice] = useState<number>();
  const [recipientAddress, setRecipientAddress] = useState<string>();
  const [addressLoading, setAddressLoading] = useState(false);

  // Fetch recipient wallet when panel opens.
  useEffect(() => {
    if (!open || recipientAddress) return;
    setAddressLoading(true);

    fetch(`/api/faces/${fid}/wallet`)
      .then((r) => r.json())
      .then((data: { ok: boolean; addresses?: string[] }) => {
        if (data.ok && data.addresses?.[0]) {
          setRecipientAddress(data.addresses[0]);
        } else {
          setErrorMsg("This profile hasn't linked a wallet to Farcaster.");
        }
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

  const usdValue = tokenPrice ? (amount * tokenPrice).toFixed(2) : null;

  async function sendTip() {
    if (!identity) { openConnect(); return; }

    if (identity.kind !== "wallet") {
      setErrorMsg("Connect a wallet to send tokens.");
      setStatus("error");
      return;
    }

    if (!recipientAddress) {
      setErrorMsg("No wallet address found for this profile.");
      setStatus("error");
      return;
    }

    const eth = (window as unknown as { ethereum?: EthereumProvider }).ethereum;
    if (!eth) { setErrorMsg("No wallet found."); setStatus("error"); return; }

    setStatus("pending");
    setErrorMsg(undefined);

    try {
      // 1. Switch to Base (chainId 8453 = 0x2105).
      try {
        await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x2105" }] });
      } catch (switchErr) {
        const code = (switchErr as { code?: number }).code;
        if (code === 4902) {
          // Base not in wallet — add it.
          await eth.request({
            method: "wallet_addEthereumChain",
            params: [{
              chainId: "0x2105",
              chainName: "Base",
              nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
              rpcUrls: ["https://mainnet.base.org"],
              blockExplorerUrls: ["https://basescan.org"]
            }]
          });
        } else {
          throw switchErr;
        }
      }

      // 2. Check FACES token balance.
      const rawAmount = BigInt(amount) * 10n ** TOKEN_DECIMALS;
      const balanceData = "0x70a08231" + identity.address.replace(/^0x/i, "").toLowerCase().padStart(64, "0");
      const balanceHex = await eth.request({ method: "eth_call", params: [{ to: TOKEN_CONTRACT, data: balanceData }, "latest"] }) as string;
      const balance = BigInt(balanceHex || "0x0");

      if (balance < rawAmount) {
        const readable = Number(balance / 10n ** 16n) / 100;
        setErrorMsg(`Insufficient balance — you have ${readable.toLocaleString()} FACES.`);
        setStatus("idle");
        return;
      }

      // 3. Send the ERC-20 transfer.
      const txData = encodeERC20Transfer(recipientAddress, rawAmount);
      await eth.request({
        method: "eth_sendTransaction",
        params: [{ from: identity.address, to: TOKEN_CONTRACT, data: txData }]
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

  if (status === "sent") {
    return <span className="tipSent">Tip sent to {recipientName}!</span>;
  }

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
        {tokenPrice && <span className="tipPrice">1 FACES ≈ ${tokenPrice.toFixed(6)}</span>}
      </div>

      {addressLoading && <p className="tipHint">Looking up wallet…</p>}

      {recipientAddress && (
        <>
          <p className="tipHint">→ {recipientAddress.slice(0, 6)}…{recipientAddress.slice(-4)}</p>

          <div className="tipPresets">
            {PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                className={amount === p ? "tipPreset active" : "tipPreset"}
                onClick={() => setAmount(p)}
              >
                {p.toLocaleString()}
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
            {usdValue && <span className="tipUsd">≈ ${usdValue}</span>}
          </div>
        </>
      )}

      {errorMsg && <p className="tipError">{errorMsg}</p>}

      {!addressLoading && (
        <div className="tipActions">
          {recipientAddress && (
            <button
              type="button"
              className="primaryButton"
              onClick={sendTip}
              disabled={status === "pending"}
            >
              {status === "pending" ? "Sending…" : `Send ${amount.toLocaleString()} FACES`}
            </button>
          )}
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

function encodeERC20Transfer(to: string, amount: bigint): string {
  const selector = "a9059cbb";
  const paddedTo = to.replace(/^0x/i, "").toLowerCase().padStart(64, "0");
  const paddedAmount = amount.toString(16).padStart(64, "0");
  return `0x${selector}${paddedTo}${paddedAmount}`;
}

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};
