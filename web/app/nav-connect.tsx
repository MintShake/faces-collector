"use client";

import { useFacesAuth } from "./auth-context";

export function NavConnect() {
  const { identity, ready, openConnect, signOut } = useFacesAuth();

  if (!ready) {
    return <span className="navConnect navConnectLoading" aria-hidden="true" />;
  }

  if (!identity) {
    return (
      <button type="button" className="navConnect" onClick={openConnect}>
        Connect
      </button>
    );
  }

  const label = identity.kind === "farcaster"
    ? identity.username ? `@${identity.username}` : `FID ${identity.fid}`
    : shortenAddress(identity.address);

  return (
    <button type="button" className="navConnect connected" onClick={signOut} title="Disconnect">
      {label}
    </button>
  );
}

function shortenAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
