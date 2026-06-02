"use client";

import { sdk } from "@farcaster/miniapp-sdk";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { FidTile } from "@/lib/pfps";
import { AddAppButton } from "./add-app-button";
import { SafeImage } from "./safe-image";

type MiniAppUser = {
  fid: number;
  username?: string;
  displayName?: string;
  pfpUrl?: string;
};

type PfpStats = {
  totalFids: number;
  totalImages: number;
  totalLikes: number;
  newest: { fid: number; image: { id: string; url: string; thumbUrl?: string; storedAt: string; size: number } } | null;
  topTimeline: { fid: number; imageCount: number } | null;
  mostLiked: { fid: number; image: { likeCount: number; storedAt: string; url: string; thumbUrl?: string } } | null;
};

type StorageStats = {
  allObjects: number;
  allBytes: number;
  allMb: number;
  pfpObjects: number;
  pfpBytes: number;
  pfpMb: number;
  pfpImages: number;
  uniqueFidsWithPfps: number;
  profileStates: number;
  socialObjects: number;
  newestPfp: { key: string; storedAt: string; size: number } | null;
  newestProfileState: { key: string; storedAt: string; size: number } | null;
};

type CollectorHealth = {
  ok?: boolean;
  error?: string;
  monitor?: {
    status?: string;
    startedAt?: string;
    connectedAt?: string;
    seenEvents?: number;
    postedProfiles?: number;
    reconnects?: number;
    lastEventAt?: string;
    lastProfilePostAt?: string;
    lastHeartbeatAt?: string;
    lastError?: string;
  };
};

const authorizedFid = Number(
  process.env.NEXT_PUBLIC_SHAKEZZ_FID ??
    process.env.NEXT_PUBLIC_ADMIN_FID ??
    679103
);
const storageFreeTierGb = Number(process.env.NEXT_PUBLIC_TIGRIS_FREE_STORAGE_GB ?? 5);

export function MiniAppHome({
  tiles,
  stats,
  storage,
  collector
}: {
  tiles: FidTile[];
  stats: PfpStats;
  storage: StorageStats;
  collector: CollectorHealth;
}) {
  const [user, setUser] = useState<MiniAppUser>();
  const [sessionState, setSessionState] = useState<"checking" | "browser" | "ready">("checking");
  const recentChanges = useMemo(() => newestImages(tiles).slice(0, 12), [tiles]);
  const isAuthorized = user?.fid === authorizedFid;
  const latestImage = stats.newest?.image;
  const storageLimitMb = storageFreeTierGb * 1024;
  const storagePercent = storageLimitMb > 0 ? (storage.allMb / storageLimitMb) * 100 : 0;

  useEffect(() => {
    let cancelled = false;

    async function bootMiniApp() {
      try {
        if (!(await sdk.isInMiniApp())) {
          if (!cancelled) {
            setSessionState("browser");
          }
          return;
        }

        const context = await sdk.context;

        if (!cancelled) {
          setUser(context.user);
          setSessionState("ready");
        }

        await sdk.actions.ready();

        if (context.user.fid === authorizedFid) {
          void fetch("/api/users", {
            method: "POST",
            headers: {
              "content-type": "application/json"
            },
            body: JSON.stringify({
              ...context.user,
              notificationDetails: context.client.notificationDetails
            })
          }).catch(() => {
            // Registration is optional for the private dashboard.
          });
        }
      } catch {
        if (!cancelled) {
          setSessionState("browser");
        }
      }
    }

    void bootMiniApp();

    return () => {
      cancelled = true;
    };
  }, []);

  if (sessionState === "checking") {
    return (
      <section className="hubGate">
        <span className="hubLabel">Shakezz Hub</span>
        <h1>Verifying session</h1>
        <p>Waiting for Farcaster Mini App context.</p>
      </section>
    );
  }

  if (!isAuthorized) {
    return (
      <section className="hubGate">
        <span className="hubLabel">Shakezz Hub</span>
        <h1>Restricted</h1>
        <p>
          Open this Mini App as the authorized Farcaster account.
          {user ? ` Current FID: ${user.fid}.` : " Browser preview is not authorized."}
        </p>
        <dl className="hubFacts">
          <div>
            <dt>Allowed FID</dt>
            <dd>{authorizedFid}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>{sessionState === "browser" ? "No Mini App session" : "FID mismatch"}</dd>
          </div>
        </dl>
      </section>
    );
  }

  return (
    <>
      <section className="hubHeader">
        <div>
          <span className="hubLabel">Shakezz Hub</span>
          <h1>Faces operations</h1>
          <p>Private project dashboard for collector, storage, and public data health.</p>
        </div>
        <div className="hubIdentity">
          {user?.pfpUrl && <SafeImage src={user.pfpUrl} alt="" />}
          <div>
            <strong>{user?.username ? `@${user.username}` : `FID ${authorizedFid}`}</strong>
            <span>authorized</span>
          </div>
          {user && <AddAppButton user={user} label="Register notifications" />}
        </div>
      </section>

      <section className="hubGrid" aria-label="Faces operating metrics">
        <Metric label="FIDs" value={stats.totalFids} detail={`${storage.uniqueFidsWithPfps.toLocaleString()} with PFP objects`} />
        <Metric label="PFPs" value={stats.totalImages} detail={`${storage.pfpMb.toLocaleString()} MB image storage`} />
        <Metric label="Objects" value={storage.allObjects} detail={`${storage.allMb.toLocaleString()} MB total`} />
        <Metric label="Likes" value={stats.totalLikes} detail={stats.mostLiked ? `Top image has ${stats.mostLiked.image.likeCount}` : "No liked images yet"} />
        <Metric label="Profiles" value={storage.profileStates} detail={storage.newestProfileState ? `Latest ${formatDate(storage.newestProfileState.storedAt)}` : "No profile state"} />
        <Metric label="Social files" value={storage.socialObjects} detail="likes and registered users" />
      </section>

      <section className="hubPanel">
        <div className="hubPanelHeader">
          <div>
            <span className="hubLabel">Storage</span>
            <h2>Tigris usage</h2>
          </div>
          <strong>{storagePercent.toFixed(2)}% of {storageFreeTierGb} GB</strong>
        </div>
        <div className="usageTrack" aria-label="Estimated storage usage">
          <span style={{ width: `${Math.min(100, storagePercent)}%` }} />
        </div>
        <dl className="hubFacts">
          <div>
            <dt>Total bytes</dt>
            <dd>{formatBytes(storage.allBytes)}</dd>
          </div>
          <div>
            <dt>PFP bytes</dt>
            <dd>{formatBytes(storage.pfpBytes)}</dd>
          </div>
          <div>
            <dt>Newest PFP</dt>
            <dd>{storage.newestPfp ? formatDate(storage.newestPfp.storedAt) : "none"}</dd>
          </div>
          <div>
            <dt>Billing note</dt>
            <dd>Storage estimate only. Request and billing totals are in Tigris.</dd>
          </div>
        </dl>
      </section>

      <section className="hubPanel">
        <div className="hubPanelHeader">
          <div>
            <span className="hubLabel">Collector</span>
            <h2>Render monitor</h2>
          </div>
          <strong>{collector.ok ? collector.monitor?.status ?? "online" : "check failed"}</strong>
        </div>
        <dl className="hubFacts">
          <div>
            <dt>Seen events</dt>
            <dd>{collector.monitor?.seenEvents?.toLocaleString() ?? "unknown"}</dd>
          </div>
          <div>
            <dt>Posted profiles</dt>
            <dd>{collector.monitor?.postedProfiles?.toLocaleString() ?? "unknown"}</dd>
          </div>
          <div>
            <dt>Last event</dt>
            <dd>{collector.monitor?.lastEventAt ? formatDate(collector.monitor.lastEventAt) : "unknown"}</dd>
          </div>
          <div>
            <dt>Last heartbeat</dt>
            <dd>{collector.monitor?.lastHeartbeatAt ? formatDate(collector.monitor.lastHeartbeatAt) : collector.error ?? "unknown"}</dd>
          </div>
        </dl>
      </section>

      <section className="hubPanel">
        <div className="hubPanelHeader">
          <div>
            <span className="hubLabel">Latest writes</span>
            <h2>Recent PFPs</h2>
          </div>
          <Link className="textButton" href="/browse">Browse</Link>
        </div>
        <div className="hubRecent">
          {recentChanges.map(({ fid, image }) => (
            <Link key={image.id} href={`/fid/${fid}`} className="hubRecentItem">
              <SafeImage src={image.thumbUrl ?? image.url} alt="" />
              <span>FID {fid}</span>
              <strong>{formatDate(image.storedAt)}</strong>
            </Link>
          ))}
        </div>
      </section>

      <section className="hubPanel">
        <div className="hubPanelHeader">
          <div>
            <span className="hubLabel">Links</span>
            <h2>Project endpoints</h2>
          </div>
        </div>
        <div className="hubLinks">
          <a href="/api/faces/stats" target="_blank" rel="noreferrer">Public stats API</a>
          <a href="/api/faces?limit=20&imagesPerFid=2" target="_blank" rel="noreferrer">Public list API</a>
          <a href="/.well-known/farcaster.json" target="_blank" rel="noreferrer">Mini App manifest</a>
          <a href="https://faces-collector.onrender.com/health" target="_blank" rel="noreferrer">Collector health</a>
        </div>
      </section>

      {latestImage && (
        <section className="hubPanel">
          <div className="hubPanelHeader">
            <div>
              <span className="hubLabel">Newest object</span>
              <h2>Last new PFP</h2>
            </div>
            <strong>FID {stats.newest?.fid}</strong>
          </div>
          <div className="hubNewest">
            <SafeImage src={latestImage.thumbUrl ?? latestImage.url} alt="" />
            <dl className="hubFacts">
              <div>
                <dt>Stored</dt>
                <dd>{formatDate(latestImage.storedAt)}</dd>
              </div>
              <div>
                <dt>Size</dt>
                <dd>{formatBytes(latestImage.size)}</dd>
              </div>
              <div>
                <dt>Image ID</dt>
                <dd>{latestImage.id}</dd>
              </div>
            </dl>
          </div>
        </section>
      )}
    </>
  );
}

function Metric({ label, value, detail }: { label: string; value: number; detail: string }) {
  return (
    <article className="hubMetric">
      <span>{label}</span>
      <strong>{value.toLocaleString()}</strong>
      <p>{detail}</p>
    </article>
  );
}

function newestImages(tiles: FidTile[]) {
  return tiles
    .flatMap((tile) => tile.images.map((image) => ({ fid: tile.fid, image })))
    .sort((a, b) => Date.parse(b.image.storedAt) - Date.parse(a.image.storedAt));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes.toLocaleString()} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}
