"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { FidTile } from "@/lib/pfps";

type SortMode = "count" | "newest" | "oldest" | "fid";
type SortDirection = "desc" | "asc";

export function GalleryControls({ tiles }: { tiles: FidTile[] }) {
  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("count");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [minimumCount, setMinimumCount] = useState(1);

  const filteredTiles = useMemo(() => {
    return [...tiles]
      .filter((tile) => String(tile.fid).includes(query.trim()))
      .filter((tile) => tile.images.length >= minimumCount)
      .sort((a, b) => compareTiles(a, b, sortMode, sortDirection));
  }, [minimumCount, query, sortDirection, sortMode, tiles]);

  const totalImages = filteredTiles.reduce((sum, tile) => sum + tile.images.length, 0);
  const maxCount = Math.max(1, ...tiles.map((tile) => tile.images.length));

  return (
    <>
      <section className="controls" aria-label="Gallery controls">
        <label>
          <span>FID</span>
          <input
            type="search"
            inputMode="numeric"
            placeholder="Search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>

        <label>
          <span>Sort</span>
          <select value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)}>
            <option value="count">PFP count</option>
            <option value="newest">Newest update</option>
            <option value="oldest">Oldest update</option>
            <option value="fid">FID</option>
          </select>
        </label>

        <label>
          <span>Order</span>
          <select
            value={sortDirection}
            onChange={(event) => setSortDirection(event.target.value as SortDirection)}
          >
            <option value="desc">High to low</option>
            <option value="asc">Low to high</option>
          </select>
        </label>

        <label>
          <span>Min PFPs</span>
          <input
            type="number"
            min={1}
            max={maxCount}
            value={minimumCount}
            onChange={(event) => setMinimumCount(clampNumber(event.target.valueAsNumber, 1, maxCount))}
          />
        </label>
      </section>

      <p className="resultCount">
        Showing {filteredTiles.length.toLocaleString()} FIDs and {totalImages.toLocaleString()} logged PFPs
      </p>

      <section className="tileGrid" aria-label="Farcaster FID PFP history">
        {filteredTiles.map((tile) => (
          <FidTileCard key={tile.fid} tile={tile} />
        ))}
      </section>
    </>
  );
}

function FidTileCard({ tile }: { tile: FidTile }) {
  const preview = tile.images.slice(0, 5);

  return (
    <Link className="tile" href={`/fid/${tile.fid}`}>
      <div className="thumbStack" aria-hidden="true">
        {preview.map((image, index) => (
          <img
            key={image.filename}
            src={image.thumbUrl ?? image.url}
            alt=""
            loading="lazy"
            decoding="async"
            style={
              {
                "--i": index
              } as React.CSSProperties
            }
          />
        ))}
      </div>
      <div className="tileMeta">
        <span className="fid">FID {tile.fid}</span>
        <span className="count">{tile.images.length.toLocaleString()}</span>
      </div>
    </Link>
  );
}

function compareTiles(
  a: FidTile,
  b: FidTile,
  sortMode: SortMode,
  sortDirection: SortDirection
) {
  const direction = sortDirection === "desc" ? -1 : 1;
  let result = 0;

  if (sortMode === "count") {
    result = a.images.length - b.images.length || newestTime(a) - newestTime(b);
  } else if (sortMode === "newest") {
    result = newestTime(a) - newestTime(b);
  } else if (sortMode === "oldest") {
    result = oldestTime(a) - oldestTime(b);
  } else {
    result = a.fid - b.fid;
  }

  return result * direction;
}

function newestTime(tile: FidTile) {
  return Date.parse(tile.images[0]?.storedAt ?? "0");
}

function oldestTime(tile: FidTile) {
  return Date.parse(tile.images.at(-1)?.storedAt ?? "0");
}

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, Math.trunc(value)));
}
