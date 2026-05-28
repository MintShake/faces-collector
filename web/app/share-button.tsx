"use client";

import { sdk } from "@farcaster/miniapp-sdk";
import { useState } from "react";

export function ShareButton({
  fid,
  count,
  variant = "secondary"
}: {
  fid?: number;
  count?: number;
  variant?: "primary" | "secondary" | "compact";
}) {
  const [copied, setCopied] = useState(false);

  async function share() {
    const path = fid ? `/fid/${fid}` : "/";
    const url = new URL(path, window.location.origin).toString();
    const text = fid
      ? `FID ${fid} has ${count?.toLocaleString() ?? "a"} logged PFP${count === 1 ? "" : "s"} on Faces.`
      : "Faces turns Farcaster PFP changes into a timeline.";

    try {
      if (await sdk.isInMiniApp()) {
        await sdk.actions.composeCast({
          text,
          embeds: [url]
        });
        return;
      }
    } catch {
      // Fall through to browser sharing outside Farcaster.
    }

    if (navigator.share) {
      await navigator.share({ title: "Faces", text, url });
      return;
    }

    await navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <button className={`shareButton ${variant}`} type="button" onClick={share}>
      {copied ? "Copied" : "Share"}
    </button>
  );
}
