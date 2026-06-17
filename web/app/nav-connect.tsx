"use client";

import Link from "next/link";
import { useFacesAuth } from "./auth-context";

export function NavConnect() {
  const { identity, ready, openConnect } = useFacesAuth();

  if (!ready) {
    return <span className="navAvatar navAvatarLoading" aria-hidden="true" />;
  }

  if (!identity) {
    return (
      <button type="button" className="navConnect" onClick={openConnect}>
        Connect
      </button>
    );
  }

  if (identity.kind === "farcaster") {
    return (
      <Link href={`/fid/${identity.fid}`} className="navAvatar" title={identity.username ? `@${identity.username}` : `FID ${identity.fid}`}>
        {identity.pfpUrl ? (
          <img src={identity.pfpUrl} alt="" width={32} height={32} />
        ) : (
          <span className="navAvatarInitials">{avatarInitials(identity.username)}</span>
        )}
      </Link>
    );
  }

  const color = blockieColor(identity.address);

  return (
    <span className="navAvatar" style={{ background: color }} title={identity.address}>
      <span className="navAvatarInitials">0x</span>
    </span>
  );
}

function avatarInitials(username?: string) {
  if (!username) return "?";
  return username.slice(0, 2).toUpperCase();
}

function blockieColor(address: string) {
  const hex = address.replace(/^0x/i, "");
  return `#${hex.slice(0, 6)}`;
}
