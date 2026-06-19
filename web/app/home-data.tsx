"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { FidTile, PfpImage } from "@/lib/pfps";
import { FidCard } from "./fid-card";
import { SafeImage } from "./safe-image";

type Stats = { totalFids: number; totalImages: number; totalLikes: number };
type HomeResponse = {
  ok: boolean;
  data: {
    stats: Stats;
    heroImages: PfpImage[];
    recentTiles: FidTile[];
    topTiles: FidTile[];
  };
};

let homePayloadPromise: Promise<HomeResponse> | undefined;

function fetchHomePayload() {
  homePayloadPromise ??= fetch("/api/home").then((r) => r.json() as Promise<HomeResponse>);
  return homePayloadPromise;
}

export function HeroStack() {
  const [images, setImages] = useState<PfpImage[]>([]);

  useEffect(() => {
    fetchHomePayload()
      .then((d: HomeResponse) => {
        setImages(d.data.heroImages.filter(Boolean));
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
  const [recentTiles, setRecentTiles] = useState<FidTile[]>([]);
  const [topTiles, setTopTiles] = useState<FidTile[]>([]);

  useEffect(() => {
    fetchHomePayload()
      .then((d: HomeResponse) => {
        setStats(d.data.stats);
        setRecentTiles(d.data.recentTiles);
        setTopTiles(d.data.topTiles);
      })
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

      {recentTiles.length > 0 && (
        <section className="homeSection">
          <div className="sectionHeading">
            <h2>Latest changes</h2>
            <Link className="textButton" href="/browse">See all</Link>
          </div>
          <div className="tileGrid">
            {recentTiles.map((tile) => (
              <FidCard key={tile.fid} tile={tile} compact />
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
