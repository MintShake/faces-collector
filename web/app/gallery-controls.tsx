"use client";

import { useEffect, useMemo, useState } from "react";
import type { FidTile } from "@/lib/pfps";
import { FidCard } from "./fid-card";

type SortMode = "likes" | "count" | "newest" | "oldest" | "fid";
type SortDirection = "desc" | "asc";
const pageSize = 240;

type FacesApiResponse = {
  ok: boolean;
  count: number;
  totalFids: number;
  totalImages: number;
  data: FidTile[];
};

export function GalleryControls({
  tiles,
  initialTotalFids,
  initialTotalImages
}: {
  tiles: FidTile[];
  initialTotalFids: number;
  initialTotalImages: number;
}) {
  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("likes");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [minimumCount, setMinimumCount] = useState(1);
  const [hiddenFids, setHiddenFids] = useState<Set<string>>(new Set());
  const [loadedTiles, setLoadedTiles] = useState(tiles);
  const [totalFids, setTotalFids] = useState(initialTotalFids);
  const [totalImages, setTotalImages] = useState(initialTotalImages);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string>();

  useEffect(() => {
    function loadHiddenFids() {
      try {
        const value = window.localStorage.getItem("faces.hiddenFids");
        const parsed = value ? JSON.parse(value) : [];
        setHiddenFids(new Set(Array.isArray(parsed) ? parsed.map(String) : []));
      } catch {
        setHiddenFids(new Set());
      }
    }

    loadHiddenFids();
    window.addEventListener("faces:hidden-fids-changed", loadHiddenFids);
    window.addEventListener("storage", loadHiddenFids);

    return () => {
      window.removeEventListener("faces:hidden-fids-changed", loadHiddenFids);
      window.removeEventListener("storage", loadHiddenFids);
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const handle = window.setTimeout(() => {
      void fetchTiles(0, true, controller.signal);
    }, 250);

    return () => {
      controller.abort();
      window.clearTimeout(handle);
    };
  }, [minimumCount, query, sortDirection, sortMode]);

  const visibleTiles = useMemo(() => {
    return loadedTiles
      .filter((tile) => !hiddenFids.has(String(tile.fid)))
      .sort((a, b) => compareTiles(a, b, sortMode, sortDirection));
  }, [hiddenFids, loadedTiles, sortDirection, sortMode]);

  const visibleImageCount = visibleTiles.reduce((sum, tile) => sum + tile.imageCount, 0);
  const maxCount = Math.max(1, ...loadedTiles.map((tile) => tile.imageCount));
  const hasMore = loadedTiles.length < totalFids;

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
            <option value="likes">Likes</option>
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
        Showing {visibleTiles.length.toLocaleString()} of {totalFids.toLocaleString()} FIDs and {visibleImageCount.toLocaleString()} of {totalImages.toLocaleString()} logged PFPs
        {hiddenFids.size > 0 && (
          <button className="inlineReset" type="button" onClick={() => {
            window.localStorage.removeItem("faces.hiddenFids");
            setHiddenFids(new Set());
          }}>
            Show hidden
          </button>
        )}
      </p>
      {loadError && <p className="loadError">{loadError}</p>}

      <section className="tileGrid" aria-label="Farcaster FID PFP history">
        {visibleTiles.map((tile) => (
          <FidCard key={tile.fid} tile={tile} />
        ))}
      </section>

      {hasMore && (
        <div className="loadMoreBar">
          <button className="primaryButton" type="button" onClick={() => void fetchTiles(loadedTiles.length, false)} disabled={isLoading}>
            {isLoading ? "Loading" : "Load more"}
          </button>
        </div>
      )}
    </>
  );

  async function fetchTiles(offset: number, replace: boolean, signal?: AbortSignal) {
    setIsLoading(true);
    setLoadError(undefined);

    try {
      const params = new URLSearchParams({
        limit: String(pageSize),
        offset: String(offset),
        imagesPerFid: "5",
        sort: sortMode,
        order: sortDirection,
        minImages: String(minimumCount)
      });
      const trimmedQuery = query.trim();

      if (trimmedQuery) {
        params.set("q", trimmedQuery);
      }

      const response = await fetch(`/api/faces?${params}`, { signal });

      if (!response.ok) {
        throw new Error(`Could not load gallery page: ${response.status}`);
      }

      const body = await response.json() as FacesApiResponse;

      if (!body.ok) {
        throw new Error("Gallery API returned an error");
      }

      setTotalFids(body.totalFids);
      setTotalImages(body.totalImages);
      setLoadedTiles((current) => replace ? body.data : mergeTiles(current, body.data));
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }

      setLoadError(error instanceof Error ? error.message : "Could not load more FIDs");
    } finally {
      setIsLoading(false);
    }
  }
}

function compareTiles(
  a: FidTile,
  b: FidTile,
  sortMode: SortMode,
  sortDirection: SortDirection
) {
  const direction = sortDirection === "desc" ? -1 : 1;
  let result = 0;

  if (sortMode === "likes") {
    result = totalLikes(a) - totalLikes(b) || newestTime(a) - newestTime(b);
  } else if (sortMode === "count") {
    result = a.imageCount - b.imageCount || newestTime(a) - newestTime(b);
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

function totalLikes(tile: FidTile) {
  return tile.images.reduce((sum, image) => sum + image.likeCount, 0);
}

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, Math.trunc(value)));
}

function mergeTiles(current: FidTile[], next: FidTile[]) {
  const byFid = new Map(current.map((tile) => [tile.fid, tile]));

  for (const tile of next) {
    byFid.set(tile.fid, tile);
  }

  return [...byFid.values()];
}
