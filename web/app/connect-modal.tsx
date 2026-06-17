"use client";

import { SignInButton } from "@farcaster/auth-kit";
import { useState } from "react";
import { useFacesAuth } from "./auth-context";

export function ConnectModal() {
  const { isConnectOpen, closeConnect, connectWallet, setFarcasterIdentity } = useFacesAuth();
  const [walletBusy, setWalletBusy] = useState(false);
  const [walletError, setWalletError] = useState<string>();

  if (!isConnectOpen) return null;

  async function handleWalletConnect() {
    setWalletBusy(true);
    setWalletError(undefined);
    const error = await connectWallet();
    setWalletBusy(false);
    if (error) setWalletError(error);
  }

  const noWallet = walletError?.includes("No wallet");

  return (
    <div className="connectOverlay" role="dialog" aria-modal="true" aria-label="Connect to Faces" onClick={closeConnect}>
      <div className="connectModal" onClick={(e) => e.stopPropagation()}>
        <h3>Connect to like &amp; earn badges</h3>
        <p>Faces requires a real identity — no anonymous activity.</p>

        <button
          type="button"
          className="connectOption"
          onClick={handleWalletConnect}
          disabled={walletBusy}
        >
          <span>{walletBusy ? "Connecting…" : "Connect wallet"}</span>
          <small>MetaMask, Coinbase Wallet, and other browser wallets</small>
        </button>

        {walletError && (
          <p className="connectError">
            {walletError}
            {noWallet && (
              <>
                {" · "}
                <a href="https://metamask.io/download" target="_blank" rel="noreferrer">
                  Get MetaMask
                </a>
              </>
            )}
          </p>
        )}
        {!walletError && !walletBusy && (
          <p className="connectHint">If MetaMask doesn&apos;t pop up, click the extension icon in your browser toolbar.</p>
        )}

        <div className="connectDivider"><span>or</span></div>

        <div className="connectFarcaster">
          <div className="connectFarcasterLabel">
            <span>Sign in with Farcaster</span>
            <small>Tap below, then scan QR with Warpcast</small>
          </div>
          <SignInButton
            onSuccess={({ fid, username, displayName, pfpUrl }) => {
              if (fid) {
                setFarcasterIdentity({ kind: "farcaster", fid, username, displayName, pfpUrl });
              }
            }}
          />
        </div>

        <button type="button" className="connectCancel" onClick={closeConnect}>
          Cancel
        </button>
      </div>
    </div>
  );
}
