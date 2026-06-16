"use client";

import { SignInButton } from "@farcaster/auth-kit";
import { useFacesAuth } from "./auth-context";

export function ConnectModal() {
  const { isConnectOpen, closeConnect, connectWallet, setFarcasterIdentity } = useFacesAuth();

  if (!isConnectOpen) return null;

  return (
    <div className="connectOverlay" role="dialog" aria-modal="true" aria-label="Connect to Faces" onClick={closeConnect}>
      <div className="connectModal" onClick={(event) => event.stopPropagation()}>
        <h3>Connect to like &amp; earn badges</h3>
        <p>Faces requires a real identity — no anonymous activity.</p>

        <button type="button" className="connectOption" onClick={connectWallet}>
          <span>Connect wallet</span>
          <small>MetaMask, Coinbase Wallet, and other browser wallets</small>
        </button>

        <div className="connectOption farcasterOption">
          <span>Sign in with Farcaster</span>
          <small>Scan with Warpcast</small>
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
