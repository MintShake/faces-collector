"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { FidTile, PfpImage } from "@/lib/pfps";
import { FidCard } from "./fid-card";
import { SafeImage } from "./safe-image";

type Stats = { totalFids: number; totalImages: number; totalLikes: number };
type RecentChange = { fid: number; profile?: FidTile["profile"]; image: PfpImage };
type ApiResponse = { ok: boolean; totalFids: number; totalImages: number; data: FidTile[] };
type StatsResponse = { ok: boolean; data: Stats };

export function HeroStack() {
  const [images, setImages] = useState<PfpImage[]>([]);

  useEffect(() => {
    fetch("/api/faces?sort=newest&limit=5&imagesPerFid=1&order=desc")
      .then((r) => r.json())
      .then((d: ApiResponse) => {
        setImages(d.data.map((t) => t.images[0]).filter(Boolean));
      })
      .catch(() => {});
  }, []);

  return (
    <div className="heroStack" aria-hidden="true">
      {images.map((img, i) => (
        <SafeImage
          key={img.id}
          src={img.thumbUrl ?? img.url}
          alt=""
          style={{ "--i": i } as React.CSSProperties}
        />
      ))}
    </div>
  );
}

export function HomeData() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [recentChanges, setRecentChanges] = useState<RecentChange[]>([]);
  const [topTiles, setTopTiles] = useState<FidTile[]>([]);

  useEffect(() => {
    fetch("/api/faces/stats")
      .then((r) => r.json())
      .then((d: StatsResponse) => setStats(d.data))
      .catch(() => {});

    fetch("/api/faces?sort=newest&limit=14&imagesPerFid=1&order=desc")
      .then((r) => r.json())
      .then((d: ApiResponse) => {
        setRecentChanges(
          d.data
            .map((t) => ({ fid: t.fid, profile: t.profile, image: t.images[0] }))
            .filter((c) => Boolean(c.image)) as RecentChange[]
        );
      })
      .catch(() => {});

    fetch("/api/faces?sort=count&limit=8&imagesPerFid=5&order=desc")
      .then((r) => r.json())
      .then((d: ApiResponse) => setTopTiles(d.data))
      .catch(() => {});
  }, []);

  return (
    <>
      {stats && (
        <div className="statsStrip">
          <div>
            <span>{stats.totalFids.toLocaleString()}</span>
            <p>profiles tracked</p>
          </div>
          <div>
            <span>{stats.totalImages.toLocaleString()}</span>
            <p>profile pics saved</p>
          </div>
          <div>
            <span>{stats.totalLikes.toLocaleString()}</span>
            <p>community likes</p>
          </div>
        </div>
      )}

      {recentChanges.length > 0 && (
        <section className="homeSection">
          <div className="sectionHeading">
            <h2>Latest changes</h2>
            <Link className="textButton" href="/browse">See all</Link>
          </div>
          <div className="changeRail">
            {recentChanges.map(({ fid, profile, image }) => (
              <Link key={image.id} className="changeCard" href={`/fid/${fid}`}>
                <SafeImage src={image.thumbUrl ?? image.url} alt="" loading="lazy" decoding="async" />
                <strong>{profile?.displayName ?? profile?.username ?? `FID ${fid}`}</strong>
                <span>{formatDate(image.storedAt)}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {topTiles.length > 0 && (
        <section className="homeSection">
          <div className="sectionHeading">
            <h2>Most eras</h2>
            <Link className="textButton" href="/browse">Browse all</Link>
          </div>
          <div className="tileGrid">
            {topTiles.map((tile) => (
              <FidCard key={tile.fid} tile={tile} compact />
            ))}
          </div>
        </section>
      )}
    </>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
