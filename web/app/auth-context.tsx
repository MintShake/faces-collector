"use client";

import "@farcaster/auth-kit/styles.css";
import { AuthKitProvider } from "@farcaster/auth-kit";
import { sdk } from "@farcaster/miniapp-sdk";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

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
  connectWallet: () => Promise<string | undefined>;
  setFarcasterIdentity: (user: FarcasterIdentity, notificationDetails?: NotificationDetails) => void;
  signOut: () => void;
};

const AuthContext = createContext<AuthState | null>(null);

const WALLET_STORAGE_KEY = "faces.wallet";
const FARCASTER_STORAGE_KEY = "faces.farcaster";

const fallbackAppUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://web-legoblocksapps.vercel.app";
const fallbackHost = (() => {
  try {
    return new URL(fallbackAppUrl).host;
  } catch {
    return "web-legoblocksapps.vercel.app";
  }
})();

function useAuthKitConfig() {
  return useMemo(() => {
    if (typeof window === "undefined") {
      return {
        rpcUrl: "https://mainnet.optimism.io",
        domain: fallbackHost,
        siweUri: `${fallbackAppUrl}/`
      };
    }

    return {
      rpcUrl: "https://mainnet.optimism.io",
      domain: window.location.host,
      siweUri: window.location.origin + "/"
    };
  }, []);
}

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

      // Restore saved Farcaster session.
      try {
        const savedFarcaster = localStorage.getItem(FARCASTER_STORAGE_KEY);
        if (savedFarcaster) {
          const parsed = JSON.parse(savedFarcaster) as FarcasterIdentity;
          if (!cancelled && parsed.fid) {
            setIdentity(parsed);
            setReady(true);
            return;
          }
        }
      } catch {
        localStorage.removeItem(FARCASTER_STORAGE_KEY);
      }

      // Restore saved wallet session.
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

  const connectWallet = useCallback(async (): Promise<string | undefined> => {
    const eth = (window as unknown as { ethereum?: EthereumProvider }).ethereum;

    if (!eth) {
      // On mobile there's no injected provider — deeplink into MetaMask's in-app browser.
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      if (isMobile) {
        window.location.href = `https://metamask.app.link/dapp/${window.location.host}${window.location.pathname}`;
        return;
      }
      return "No wallet found — install the MetaMask browser extension to continue.";
    }

    try {
      const accounts = await eth.request({ method: "eth_requestAccounts" }) as string[];
      const address = accounts[0];

      if (!address) return "No account returned from wallet.";

      localStorage.setItem(WALLET_STORAGE_KEY, address);
      setIdentity({ kind: "wallet", address });
      setConnectOpen(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.toLowerCase().includes("rejected") || msg.toLowerCase().includes("denied")) {
        return "Connection cancelled.";
      }
      return "Wallet connection failed — check the MetaMask extension and try again.";
    }
  }, []);

  const setFarcasterIdentity = useCallback((user: FarcasterIdentity, notificationDetails?: NotificationDetails) => {
    try {
      localStorage.setItem(FARCASTER_STORAGE_KEY, JSON.stringify(user));
    } catch {
      // Storage full or restricted — session won't persist.
    }
    setIdentity(user);
    setConnectOpen(false);
    void registerUser(user, notificationDetails);
  }, []);

  const signOut = useCallback(() => {
    localStorage.removeItem(WALLET_STORAGE_KEY);
    localStorage.removeItem(FARCASTER_STORAGE_KEY);
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
  const config = useAuthKitConfig();

  return (
    <AuthKitProvider config={config}>
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
