"use client";

import { AuthKitProvider } from "@farcaster/auth-kit";
import { sdk } from "@farcaster/miniapp-sdk";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

export type FarcasterIdentity = {
  kind: "farcaster";
  fid: number;
  username?: string;
  displayName?: string;
  pfpUrl?: string;
};

export type WalletIdentity = {
  kind: "wallet";
  address: string;
};

export type Identity = FarcasterIdentity | WalletIdentity;

type NotificationDetails = { url: string; token: string };

type AuthState = {
  identity: Identity | null;
  ready: boolean;
  isConnectOpen: boolean;
  openConnect: () => void;
  closeConnect: () => void;
  connectWallet: () => Promise<void>;
  setFarcasterIdentity: (user: FarcasterIdentity, notificationDetails?: NotificationDetails) => void;
  signOut: () => void;
};

const AuthContext = createContext<AuthState | null>(null);

const WALLET_STORAGE_KEY = "faces.wallet";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://web-legoblocksapps.vercel.app";
const appHost = (() => {
  try {
    return new URL(appUrl).host;
  } catch {
    return "web-legoblocksapps.vercel.app";
  }
})();

const authKitConfig = {
  rpcUrl: "https://mainnet.optimism.io",
  domain: appHost,
  siweUri: `${appUrl}/`
};

function AuthState({ children }: { children: React.ReactNode }) {
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [ready, setReady] = useState(false);
  const [isConnectOpen, setConnectOpen] = useState(false);
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    let cancelled = false;

    async function init() {
      try {
        if (await sdk.isInMiniApp()) {
          const context = await sdk.context;
          if (cancelled) return;
          const user: FarcasterIdentity = {
            kind: "farcaster",
            fid: context.user.fid,
            username: context.user.username,
            displayName: context.user.displayName,
            pfpUrl: context.user.pfpUrl
          };
          setIdentity(user);
          await registerUser(user, context.client.notificationDetails);
          setReady(true);
          return;
        }
      } catch {
        // Not in a Farcaster Mini App — fall through to browser identity.
      }

      try {
        const eth = (window as unknown as { ethereum?: EthereumProvider }).ethereum;
        const saved = localStorage.getItem(WALLET_STORAGE_KEY);

        if (eth && saved) {
          const accounts = await eth.request({ method: "eth_accounts" }) as string[];
          if (!cancelled && accounts[0]?.toLowerCase() === saved.toLowerCase()) {
            setIdentity({ kind: "wallet", address: accounts[0] });
          } else {
            localStorage.removeItem(WALLET_STORAGE_KEY);
          }
        }
      } catch {
        // No injected wallet, or user revoked access.
      }

      if (!cancelled) setReady(true);
    }

    void init();
    return () => {
      cancelled = true;
    };
  }, []);

  const connectWallet = useCallback(async () => {
    const eth = (window as unknown as { ethereum?: EthereumProvider }).ethereum;

    if (!eth) {
      window.open("https://metamask.io/download", "_blank", "noreferrer");
      return;
    }

    const accounts = await eth.request({ method: "eth_requestAccounts" }) as string[];
    const address = accounts[0];

    if (!address) return;

    localStorage.setItem(WALLET_STORAGE_KEY, address);
    setIdentity({ kind: "wallet", address });
    setConnectOpen(false);
  }, []);

  const setFarcasterIdentity = useCallback((user: FarcasterIdentity, notificationDetails?: NotificationDetails) => {
    setIdentity(user);
    setConnectOpen(false);
    void registerUser(user, notificationDetails);
  }, []);

  const signOut = useCallback(() => {
    localStorage.removeItem(WALLET_STORAGE_KEY);
    setIdentity(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        identity,
        ready,
        isConnectOpen,
        openConnect: () => setConnectOpen(true),
        closeConnect: () => setConnectOpen(false),
        connectWallet,
        setFarcasterIdentity,
        signOut
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  return (
    <AuthKitProvider config={authKitConfig}>
      <AuthState>{children}</AuthState>
    </AuthKitProvider>
  );
}

export function useFacesAuth() {
  const ctx = useContext(AuthContext);

  if (!ctx) {
    throw new Error("useFacesAuth must be used within AuthProvider");
  }

  return ctx;
}

export function viewerIdFor(identity: Identity | null): string | undefined {
  if (!identity) return undefined;
  return identity.kind === "farcaster" ? `fid:${identity.fid}` : `addr:${identity.address.toLowerCase()}`;
}

export function viewerPayloadFor(identity: Identity | null) {
  if (!identity) return undefined;

  return identity.kind === "farcaster"
    ? { fid: identity.fid, username: identity.username, displayName: identity.displayName, pfpUrl: identity.pfpUrl }
    : { address: identity.address };
}

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

async function registerUser(user: FarcasterIdentity, notificationDetails?: NotificationDetails) {
  await fetch("/api/users", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      fid: user.fid,
      username: user.username,
      displayName: user.displayName,
      pfpUrl: user.pfpUrl,
      notificationDetails
    })
  });
}
