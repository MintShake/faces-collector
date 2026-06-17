"use client";

import Link from "next/link";
import { useWeb3ModalAccount } from "@web3modal/ethers/react";
import { useFacesAuth } from "./auth-context";

export function NavConnect() {
  const { identity, ready, isMiniApp, openConnect, signOut } = useFacesAuth();
  const { isConnected: w3mConnected } = useWeb3ModalAccount();

  if (!ready) return <span className="navAvatarLoading" aria-hidden="true" />;

  // Mini app — Farcaster identity only, show avatar linked to own profile.
  if (isMiniApp && identity?.kind === "farcaster") {
    return (
      <Link href={`/fid/${identity.fid}`} className="navAvatar" title={identity.username ? `@${identity.username}` : `FID ${identity.fid}`}>
        {identity.pfpUrl
          ? <img src={identity.pfpUrl} alt="" width={32} height={32} />
          : <span className="navAvatarInitials">{avatarInitials(identity.username)}</span>}
      </Link>
    );
  }

  // Farcaster session (standalone) — avatar links to own profile, long-press to sign out.
  if (identity?.kind === "farcaster") {
    return (
      <button type="button" className="navAvatar" onClick={signOut} title="Sign out">
        {identity.pfpUrl
          ? <img src={identity.pfpUrl} alt="" width={32} height={32} />
          : <span className="navAvatarInitials">{avatarInitials(identity.username)}</span>}
      </button>
    );
  }

  // Wallet connected via Web3Modal — Web3Modal owns its own disconnect UX; show a simple indicator.
  if (w3mConnected) {
    return <w3m-button />;
  }

  // Not connected — show Connect button.
  return (
    <button type="button" className="navConnect" onClick={openConnect}>
      Connect
    </button>
  );
}

function avatarInitials(username?: string) {
  if (!username) return "?";
  return username.slice(0, 2).toUpperCase();
}
