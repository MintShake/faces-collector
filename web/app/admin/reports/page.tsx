"use client";

import { useState } from "react";

type PendingReport = {
  fid: number;
  imageId: string;
  reason: string;
  note?: string;
  reportCount: number;
  firstReportedAt: string;
  lastReportedAt: string;
  status: "pending" | "hidden";
  reviewedAt?: string;
};

type ReportsResponse = {
  ok: boolean;
  count: number;
  data: PendingReport[];
};

export default function AdminReportsPage() {
  const [token, setToken] = useState("");
  const [reports, setReports] = useState<PendingReport[]>([]);
  const [status, setStatus] = useState<string>("");
  const [busyImageId, setBusyImageId] = useState<string>();

  async function loadReports() {
    setStatus("Loading");
    try {
      const response = await fetch("/api/reports", {
        headers: { "x-admin-secret": token },
        cache: "no-store"
      });

      if (!response.ok) {
        setStatus(response.status === 401 ? "Unauthorized" : `Could not load: ${response.status}`);
        return;
      }

      const body = await response.json() as ReportsResponse;
      setReports(body.data);
      setStatus(`${body.count} item${body.count === 1 ? "" : "s"}`);
    } catch {
      setStatus("Could not load reports");
    }
  }

  async function review(imageId: string, action: "restore" | "keep_hidden") {
    setBusyImageId(imageId);
    try {
      const response = await fetch("/api/reports", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "x-admin-secret": token
        },
        body: JSON.stringify({ imageId, action })
      });

      if (!response.ok) {
        setStatus(`Review failed: ${response.status}`);
        return;
      }

      await loadReports();
    } finally {
      setBusyImageId(undefined);
    }
  }

  return (
    <main className="shell adminShell">
      <header className="topbar">
        <div>
          <span className="appMark">Faces</span>
          <h1>Report review</h1>
          <p>Reported images stay hidden until you restore them.</p>
        </div>
      </header>

      <section className="adminControls">
        <input
          type="password"
          value={token}
          onChange={(event) => setToken(event.target.value)}
          placeholder="Admin token"
        />
        <button className="primaryButton" type="button" onClick={loadReports} disabled={!token}>
          Load reports
        </button>
        <span>{status}</span>
      </section>

      <section className="adminReportList">
        {reports.map((report) => (
          <article key={report.imageId} className="adminReportCard">
            <div>
              <strong>{report.imageId}</strong>
              <span>FID {report.fid} · {report.reason} · {report.status}</span>
              {report.note && <p>{report.note}</p>}
              <small>{report.reportCount} report{report.reportCount === 1 ? "" : "s"} · last {formatDate(report.lastReportedAt)}</small>
            </div>
            <div className="adminReportActions">
              <a className="textButton" href={`/fid/${report.fid}`} target="_blank" rel="noreferrer">Open</a>
              <button
                className="textButton"
                type="button"
                onClick={() => review(report.imageId, "restore")}
                disabled={busyImageId === report.imageId}
              >
                Restore
              </button>
              <button
                className="textButton danger"
                type="button"
                onClick={() => review(report.imageId, "keep_hidden")}
                disabled={busyImageId === report.imageId}
              >
                Keep hidden
              </button>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}
