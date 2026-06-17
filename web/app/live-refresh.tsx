"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

export function LiveRefresh({
  renderedAt,
  intervalMs = 60_000
}: {
  renderedAt?: string;
  intervalMs?: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [lastUpdated, setLastUpdated] = useState(() => renderedAt ?? new Date().toISOString());
  const [lastUpdatedLabel, setLastUpdatedLabel] = useState("just now");

  useEffect(() => {
    if (renderedAt) {
      setLastUpdated(renderedAt);
      setLastUpdatedLabel(formatTime(renderedAt));
    }
  }, [renderedAt]);

  useEffect(() => {
    function refresh() {
      if (document.visibilityState !== "visible") {
        return;
      }

      startTransition(() => {
        router.refresh();
      });
    }

    const timer = window.setInterval(refresh, intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs, router]);

  return (
    <div className="liveRefresh" aria-live="polite">
      <span className={isPending ? "liveDot pending" : "liveDot"} />
      <span>{isPending ? "Syncing" : "Live"}</span>
      <time dateTime={lastUpdated}>{lastUpdatedLabel}</time>
    </div>
  );
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(value));
}
