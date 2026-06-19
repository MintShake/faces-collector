"use client";

import { useRef, useState } from "react";
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
  const wrapRef = useRef<HTMLDivElement>(null);

  async function remove() {
    setStatus("busy");
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fid, imageId, reason: "owner_remove" })
      });
      if (res.ok) {
        setStatus("sent");
        hideReportedImage(wrapRef.current);
      } else {
        setStatus("idle");
      }
    } catch {
      setStatus("idle");
    }
  }

  return (
    <div ref={wrapRef}>
      <button className="textButton danger" type="button" onClick={remove} disabled={status !== "idle"}>
        {status === "sent" ? "Removed" : status === "busy" ? "Removing…" : "Remove"}
      </button>
    </div>
  );
}

const REPORT_REASONS = [
  { value: "not_me", label: "Not me / wrong person" },
  { value: "offensive", label: "Offensive or harmful" },
  { value: "outdated", label: "Outdated / want removed" },
  { value: "other", label: "Other" },
];

function ReportButton({ fid, imageId }: { fid: number; imageId?: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("not_me");
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<"idle" | "busy" | "sent">("idle");
  const wrapRef = useRef<HTMLDivElement>(null);
  const noteRequired = reason === "other";
  const canSubmit = Boolean(reason) && (!noteRequired || note.trim().length >= 3);

  async function submit() {
    setStatus("busy");
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fid,
          imageId,
          reason,
          note: note.trim() || undefined,
          reporterContext: "user_reported"
        })
      });
      if (res.ok) {
        setStatus("sent");
        setOpen(false);
        hideReportedImage(wrapRef.current);
      } else {
        setStatus("idle");
      }
    } catch {
      setStatus("idle");
    }
  }

  if (status === "sent") {
    return <span ref={wrapRef} className="textButton muted">Reported</span>;
  }

  if (!open) {
    return (
      <div ref={wrapRef}>
        <button className="textButton danger" type="button" onClick={() => setOpen(true)}>
          Report
        </button>
      </div>
    );
  }

  return (
    <div className="reportPanel" ref={wrapRef}>
      <p className="reportLabel">Why are you reporting this?</p>
      <div className="reportReasons">
        {REPORT_REASONS.map((r) => (
          <label key={r.value} className={reason === r.value ? "reportReason active" : "reportReason"}>
            <input
              type="radio"
              name={`report-reason-${imageId ?? fid}`}
              value={r.value}
              checked={reason === r.value}
              onChange={() => setReason(r.value)}
            />
            {r.label}
          </label>
        ))}
      </div>
      {(reason === "other" || reason === "offensive") && (
        <textarea
          className="reportNote"
          placeholder={noteRequired ? "Required: add a few details" : "Optional: add details"}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={300}
          rows={2}
        />
      )}
      <div className="reportActions">
        <button
          type="button"
          className="primaryButton small"
          onClick={submit}
          disabled={status === "busy" || !canSubmit}
        >
          {status === "busy" ? "Sending…" : "Submit report"}
        </button>
        <button
          type="button"
          className="textButton"
          onClick={() => { setOpen(false); setStatus("idle"); }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function hideReportedImage(node: HTMLElement | null) {
  node?.closest(".historyItem")?.classList.add("reportedPending");
}
