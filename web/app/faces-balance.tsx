"use client";

import { useEffect, useState } from "react";
import { sdk } from "@farcaster/miniapp-sdk";
import { useWeb3ModalAccount } from "@web3modal/ethers/react";
import { useFacesAuth } from "./auth-context";

const FACES_TOKEN = "0xa199Ab829b992FD357E40F1E91be724D7273aa82";

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

export function FacesBalance() {
  const { isMiniApp, ready } = useFacesAuth();
  const { address, isConnected } = useWeb3ModalAccount();
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!ready) return;

    let cancelled = false;

    async function load() {
      setLoading(true);
      setBalance(null);

      try {
        const wallet = isMiniApp
          ? await miniAppWalletAddress()
          : isConnected && address
            ? address
            : undefined;

        if (!wallet) return;

        const raw = await getFacesBalance(wallet);
        if (!cancelled) setBalance(Number(raw / 10n ** 16n) / 100);
      } catch {
        if (!cancelled) setBalance(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [address, isConnected, isMiniApp, ready]);

  if (!ready || loading || balance === null) {
    return null;
  }

  return (
    <span className="navFacesBalance" title="Connected wallet FACES balance">
      {formatFaces(balance)} FACES
    </span>
  );
}

async function miniAppWalletAddress() {
  const provider = await sdk.wallet.getEthereumProvider().catch(() => undefined);
  if (!provider) return undefined;

  const eth = provider as unknown as EthereumProvider;
  const accounts = await eth.request({ method: "eth_accounts" }).catch(() => []) as string[];
  return accounts[0];
}

async function getFacesBalance(address: string) {
  const data = "0x70a08231" + address.replace(/^0x/i, "").toLowerCase().padStart(64, "0");
  const res = await fetch("https://mainnet.base.org", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_call",
      params: [{ to: FACES_TOKEN, data }, "latest"]
    }),
  });
  const json = await res.json() as { result?: string };
  return BigInt(json.result ?? "0x0");
}

function formatFaces(balance: number) {
  if (balance >= 1000) {
    return balance.toLocaleString(undefined, { maximumFractionDigits: 0 });
  }

  return balance.toLocaleString(undefined, { maximumFractionDigits: 2 });
}
