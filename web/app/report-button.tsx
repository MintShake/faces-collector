"use client";

import { sdk } from "@farcaster/miniapp-sdk";
import { useRef, useState } from "react";

const REPORT_REASONS = [
  { value: "not_me", label: "Not me / wrong person" },
  { value: "offensive", label: "Offensive or harmful" },
  { value: "outdated", label: "Outdated / want removed" },
  { value: "other", label: "Other" },
];

export function ReportButton({
  fid,
  imageId
}: {
  fid: number;
  imageId?: string;
}) {
  const [status, setStatus] = useState<"idle" | "sent" | "busy">("idle");
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("not_me");
  const [note, setNote] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);
  const noteRequired = reason === "other";
  const canSubmit = Boolean(reason) && (!noteRequired || note.trim().length >= 3);

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
          reason,
          note: note.trim() || undefined,
          reporterContext: "user_reported"
        })
      });

      if (response.ok) {
        setStatus("sent");
        wrapRef.current?.closest(".historyItem")?.classList.add("reportedPending");
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
        {REPORT_REASONS.map((item) => (
          <label key={item.value} className={reason === item.value ? "reportReason active" : "reportReason"}>
            <input
              type="radio"
              name={`report-reason-${imageId ?? fid}`}
              value={item.value}
              checked={reason === item.value}
              onChange={() => setReason(item.value)}
            />
            {item.label}
          </label>
        ))}
      </div>
      {(reason === "other" || reason === "offensive") && (
        <textarea
          className="reportNote"
          placeholder={noteRequired ? "Required: add a few details" : "Optional: add details"}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          maxLength={300}
          rows={2}
        />
      )}
      <div className="reportActions">
        <button className="primaryButton small" type="button" onClick={report} disabled={status === "busy" || !canSubmit}>
          {status === "busy" ? "Sending" : "Submit report"}
        </button>
        <button className="textButton" type="button" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}
