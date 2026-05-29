"use client";

import { sdk } from "@farcaster/miniapp-sdk";
import { useState } from "react";

export function ReportButton({
  fid,
  imageId
}: {
  fid: number;
  imageId?: string;
}) {
  const [status, setStatus] = useState<"idle" | "sent" | "busy">("idle");

  async function report() {
    setStatus("busy");

    try {
      let reporterFid: number | undefined;

      try {
        if (await sdk.isInMiniApp()) {
          reporterFid = (await sdk.context).user?.fid;
        }
      } catch {
        // Reports still work outside Farcaster.
      }

      const response = await fetch("/api/reports", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          fid,
          imageId,
          reporterFid,
          reason: "user_reported"
        })
      });

      setStatus(response.ok ? "sent" : "idle");
    } catch {
      setStatus("idle");
    }
  }

  return (
    <button className="textButton danger" type="button" onClick={report} disabled={status === "busy" || status === "sent"}>
      {status === "sent" ? "Reported" : status === "busy" ? "Sending" : "Report"}
    </button>
  );
}
