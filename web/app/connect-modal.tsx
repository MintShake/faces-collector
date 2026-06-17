"use client";

import { SignInButton } from "@farcaster/auth-kit";
import { useFacesAuth } from "./auth-context";

export function ConnectModal() {
  const { isConnectOpen, closeConnect, openWalletModal, setFarcasterIdentity } = useFacesAuth();

  if (!isConnectOpen) return null;

  function handleWallet() {
    closeConnect();
    openWalletModal();
  }

  return (
    <div className="connectOverlay" role="dialog" aria-modal="true" aria-label="Connect to Faces" onClick={closeConnect}>
      <div className="connectModal" onClick={(e) => e.stopPropagation()}>
        <h3>Connect to Faces</h3>
        <p>Like pics, earn badges, and tip creators.</p>

        <button type="button" className="connectOption" onClick={handleWallet}>
          <span>Connect wallet</span>
          <small>MetaMask, Coinbase, WalletConnect &amp; more</small>
        </button>

        <div className="connectDivider"><span>or</span></div>

        <div className="connectFarcaster">
          <div className="connectFarcasterLabel">
            <span>Sign in with Farcaster</span>
            <small>Scan with Warpcast</small>
          </div>
          <SignInButton
            onSuccess={({ fid, username, displayName, pfpUrl }) => {
              if (fid) setFarcasterIdentity({ kind: "farcaster", fid, username, displayName, pfpUrl });
            }}
          />
        </div>

        <button type="button" className="connectCancel" onClick={closeConnect}>Cancel</button>
      </div>
    </div>
  );
}
