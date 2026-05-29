"use client";

import { sdk } from "@farcaster/miniapp-sdk";
import { useState } from "react";

export function ShareButton({
  fid,
  count,
  variant = "secondary",
  label,
  text
}: {
  fid?: number;
  count?: number;
  variant?: "primary" | "secondary" | "compact";
  label?: string;
  text?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function share() {
    const path = fid ? `/fid/${fid}` : "/";
    const url = new URL(path, window.location.origin).toString();
    const shareText = text ?? (fid
      ? `FID ${fid} has ${count?.toLocaleString() ?? "a"} logged PFP${count === 1 ? "" : "s"} on Faces.`
      : "Faces turns Farcaster PFP changes into a timeline.");

    try {
      if (await sdk.isInMiniApp()) {
        await sdk.actions.composeCast({
          text: shareText,
          embeds: [url]
        });
        return;
      }
    } catch {
      // Fall through to browser sharing outside Farcaster.
    }

    if (navigator.share) {
      await navigator.share({ title: "Faces", text: shareText, url });
      return;
    }

    await navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <button className={`shareButton ${variant}`} type="button" onClick={share}>
      {copied ? "Copied" : label ?? "Share"}
    </button>
  );
}
