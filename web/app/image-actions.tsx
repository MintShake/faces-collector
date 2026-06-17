"use client";

import { useState } from "react";
import { useFacesAuth } from "./auth-context";

export function ImageActions({
  ownerFid,
  imageId,
  fid
}: {
  ownerFid: number;
  imageId?: string;
  fid: number;
}) {
  const { identity } = useFacesAuth();
  const isOwner = identity?.kind === "farcaster" && identity.fid === ownerFid;

  return isOwner
    ? <RemoveButton fid={fid} imageId={imageId} />
    : <ReportButton fid={fid} imageId={imageId} />;
}

function RemoveButton({ fid, imageId }: { fid: number; imageId?: string }) {
  const [status, setStatus] = useState<"idle" | "sent" | "busy">("idle");

  async function remove() {
    setStatus("busy");

    try {
      const response = await fetch("/api/reports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fid, imageId, reason: "owner_remove" })
      });
      setStatus(response.ok ? "sent" : "idle");
    } catch {
      setStatus("idle");
    }
  }

  return (
    <button className="textButton danger" type="button" onClick={remove} disabled={status !== "idle"}>
      {status === "sent" ? "Removed" : status === "busy" ? "Removing" : "Remove"}
    </button>
  );
}

function ReportButton({ fid, imageId }: { fid: number; imageId?: string }) {
  const [status, setStatus] = useState<"idle" | "sent" | "busy">("idle");

  async function report() {
    setStatus("busy");

    try {
      const response = await fetch("/api/reports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fid, imageId, reason: "user_reported" })
      });
      setStatus(response.ok ? "sent" : "idle");
    } catch {
      setStatus("idle");
    }
  }

  return (
    <button className="textButton danger" type="button" onClick={report} disabled={status !== "idle"}>
      {status === "sent" ? "Reported" : status === "busy" ? "Sending" : "Report"}
    </button>
  );
}
