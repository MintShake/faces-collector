"use client";

import "@farcaster/auth-kit/styles.css";
import "./web3modal-config";
import { AuthKitProvider } from "@farcaster/auth-kit";
import { sdk } from "@farcaster/miniapp-sdk";
import { useWeb3Modal, useWeb3ModalAccount } from "@web3modal/ethers/react";
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
  isMiniApp: boolean;
  isConnectOpen: boolean;
  openConnect: () => void;
  closeConnect: () => void;
  openWalletModal: () => void;
  setFarcasterIdentity: (user: FarcasterIdentity, notificationDetails?: NotificationDetails) => void;
  signOut: () => void;
};

const AuthContext = createContext<AuthState | null>(null);

const FARCASTER_STORAGE_KEY = "faces.farcaster";

const fallbackAppUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://web-sigma-three-32.vercel.app";
const fallbackHost = (() => {
  try { return new URL(fallbackAppUrl).host; } catch { return "web-sigma-three-32.vercel.app"; }
})();

function useAuthKitConfig() {
  return useMemo(() => {
    if (typeof window === "undefined") {
      return { rpcUrl: "https://mainnet.optimism.io", domain: fallbackHost, siweUri: `${fallbackAppUrl}/` };
    }
    return { rpcUrl: "https://mainnet.optimism.io", domain: window.location.host, siweUri: window.location.origin + "/" };
  }, []);
}

function AuthState({ children }: { children: React.ReactNode }) {
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [ready, setReady] = useState(false);
  const [isMiniApp, setIsMiniApp] = useState(false);
  const [isConnectOpen, setConnectOpen] = useState(false);
  const initialized = useRef(false);

  // Web3Modal wallet state — sync into our identity when it changes.
  const { address: w3mAddress, isConnected: w3mConnected } = useWeb3ModalAccount();
  const { open: openW3M } = useWeb3Modal();

  useEffect(() => {
    // Only sync wallet identity from Web3Modal — don't clobber a Farcaster session.
    if (identity?.kind === "farcaster") return;
    if (w3mConnected && w3mAddress) {
      setIdentity({ kind: "wallet", address: w3mAddress });
    } else if (!w3mConnected && identity?.kind === "wallet") {
      setIdentity(null);
    }
  }, [w3mAddress, w3mConnected]);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    let cancelled = false;

    async function init() {
      // 1. Mini App — identity comes from Farcaster SDK, skip everything else.
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
          setIsMiniApp(true);
          await registerUser(user, context.client.notificationDetails);
          setReady(true);
          return;
        }
      } catch { /* not in mini app */ }

      // 2. Restore saved Farcaster session.
      try {
        const saved = localStorage.getItem(FARCASTER_STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved) as FarcasterIdentity;
          if (!cancelled && parsed.fid) {
            setIdentity(parsed);
            setReady(true);
            return;
          }
        }
      } catch {
        localStorage.removeItem(FARCASTER_STORAGE_KEY);
      }

      // 3. Web3Modal handles wallet restore automatically — just mark ready.
      if (!cancelled) setReady(true);
    }

    void init();
    return () => { cancelled = true; };
  }, []);

  const openWalletModal = useCallback(() => { void openW3M(); }, [openW3M]);

  const setFarcasterIdentity = useCallback((user: FarcasterIdentity, notificationDetails?: NotificationDetails) => {
    try { localStorage.setItem(FARCASTER_STORAGE_KEY, JSON.stringify(user)); } catch { /* storage full */ }
    setIdentity(user);
    setConnectOpen(false);
    void registerUser(user, notificationDetails);
  }, []);

  const signOut = useCallback(() => {
    localStorage.removeItem(FARCASTER_STORAGE_KEY);
    setIdentity(null);
    // Web3Modal handles wallet disconnect on its own button.
  }, []);

  return (
    <AuthContext.Provider value={{
      identity, ready, isMiniApp, isConnectOpen,
      openConnect: () => setConnectOpen(true),
      closeConnect: () => setConnectOpen(false),
      openWalletModal,
      setFarcasterIdentity,
      signOut
    }}>
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
  if (!ctx) throw new Error("useFacesAuth must be used within AuthProvider");
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

async function registerUser(user: FarcasterIdentity, notificationDetails?: NotificationDetails) {
  await fetch("/api/users", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ fid: user.fid, username: user.username, displayName: user.displayName, pfpUrl: user.pfpUrl, notificationDetails })
  });
}
