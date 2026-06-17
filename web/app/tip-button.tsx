"use client";

import { useEffect, useState } from "react";
import { useFacesAuth } from "./auth-context";

const TOKEN_CONTRACT = "0xa199Ab829b992FD357E40F1E91be724D7273aa82";
const TOKEN_DECIMALS = 18n;
const PRESETS = [100, 500, 1000, 5000];

type Status = "idle" | "pending" | "sent" | "error";

export function TipButton({
  recipientAddress,
  recipientName
}: {
  recipientAddress: string;
  recipientName: string;
}) {
  const { identity, openConnect } = useFacesAuth();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(100);
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState<string>();
  const [tokenPrice, setTokenPrice] = useState<number>();

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
    if (!identity) {
      openConnect();
      return;
    }

    if (identity.kind !== "wallet") {
      setErrorMsg("Switch to a wallet connection to send tokens.");
      setStatus("error");
      return;
    }

    const eth = (window as unknown as { ethereum?: EthereumProvider }).ethereum;

    if (!eth) {
      setErrorMsg("No wallet found.");
      setStatus("error");
      return;
    }

    setStatus("pending");
    setErrorMsg(undefined);

    try {
      const rawAmount = BigInt(amount) * 10n ** TOKEN_DECIMALS;
      const data = encodeERC20Transfer(recipientAddress, rawAmount);

      await eth.request({
        method: "eth_sendTransaction",
        params: [{ from: identity.address, to: TOKEN_CONTRACT, data }]
      });

      setStatus("sent");
      setOpen(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.toLowerCase().includes("rejected") || msg.toLowerCase().includes("denied")) {
        setStatus("idle");
      } else {
        setErrorMsg("Transaction failed. Try again.");
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
        {tokenPrice && (
          <span className="tipPrice">1 FACES ≈ ${tokenPrice.toFixed(6)}</span>
        )}
      </div>

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

      {errorMsg && <p className="tipError">{errorMsg}</p>}

      <div className="tipActions">
        <button
          type="button"
          className="primaryButton"
          onClick={sendTip}
          disabled={status === "pending"}
        >
          {status === "pending" ? "Sending…" : `Send ${amount.toLocaleString()} FACES`}
        </button>
        <button
          type="button"
          className="textButton"
          onClick={() => { setOpen(false); setStatus("idle"); setErrorMsg(undefined); }}
        >
          Cancel
        </button>
      </div>
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
