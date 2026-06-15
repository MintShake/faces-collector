"use client";

import { sdk } from "@farcaster/miniapp-sdk";
import { useState } from "react";

export function CompareButton({ fid }: { fid: number }) {
  const [label, setLabel] = useState("Compare with mine");

  async function compare() {
    try {
      if (!(await sdk.isInMiniApp())) {
        setLabel("Open in Farcaster");
        return;
      }

      const context = await sdk.context;

      if (!context.user?.fid) {
        setLabel("Sign in to compare");
        return;
      }

      if (context.user.fid === fid) {
        window.location.href = `/fid/${fid}`;
        return;
      }

      await sdk.actions.composeCast({
        text: `Compare my profile pic history with this person on Faces.`,
        embeds: [
          new URL(`/fid/${fid}`, window.location.origin).toString(),
          new URL(`/fid/${context.user.fid}`, window.location.origin).toString()
        ]
      });
    } catch {
      setLabel("Try in Farcaster");
    }
  }

  return (
    <button className="shareButton" type="button" onClick={compare}>
      {label}
    </button>
  );
}
