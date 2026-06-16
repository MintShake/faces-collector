"use client";

import { useEffect, useMemo, useState } from "react";
import type { PfpImage } from "@/lib/pfps";
import { useFacesAuth, viewerIdFor, viewerPayloadFor } from "./auth-context";

type LikeUser = {
  id: string;
  fid?: number;
  address?: string;
  username?: string;
  displayName?: string;
  pfpUrl?: string;
  likedAt: string;
};

type LikeResponse = {
  count: number;
  viewerLiked: boolean;
  likes: LikeUser[];
};

export function LikePanel({
  ownerFid,
  image,
  compact = false
}: {
  ownerFid: number;
  image: PfpImage;
  compact?: boolean;
}) {
  const { identity, ready, openConnect } = useFacesAuth();
  const [count, setCount] = useState(image.likeCount);
  const [viewerLiked, setViewerLiked] = useState(false);
  const [likes, setLikes] = useState<LikeUser[]>([]);
  const [busy, setBusy] = useState(false);
  const [storageUnavailable, setStorageUnavailable] = useState(false);
  const visibleLikes = useMemo(() => likes.slice(0, compact ? 3 : 8), [compact, likes]);
  const viewerId = viewerIdFor(identity);

  useEffect(() => {
    if (compact) return;

    let cancelled = false;

    async function loadLikes() {
      const params = new URLSearchParams({ imageId: image.id });
      if (viewerId) params.set("viewerId", viewerId);

      const response = await fetch(`/api/likes?${params.toString()}`, { cache: "no-store" });
      if (!response.ok || cancelled) return;

      const data = await response.json() as LikeResponse;
      setCount(data.count);
      setViewerLiked(data.viewerLiked);
      setLikes(data.likes);
    }

    void loadLikes();
    return () => { cancelled = true; };
  }, [compact, image.id, viewerId]);

  async function toggleLike() {
    if (!ready) return;

    if (!identity) {
      openConnect();
      return;
    }

    setBusy(true);

    try {
      const response = await fetch("/api/likes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          imageId: image.id,
          ownerFid,
          imageUrl: image.url,
          action: viewerLiked ? "unlike" : "like",
          user: viewerPayloadFor(identity)
        })
      });

      if (!response.ok) {
        if (response.status === 503) setStorageUnavailable(true);
        return;
      }

      const data = await response.json() as LikeResponse;
      setCount(data.count);
      setViewerLiked(data.viewerLiked);
      setLikes(data.likes);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={compact ? "likePanel compact" : "likePanel"}>
      <button
        type="button"
        className={viewerLiked ? "likeButton active" : "likeButton"}
        onClick={toggleLike}
        disabled={busy || !ready}
      >
        {storageUnavailable
          ? "Unavailable"
          : !identity
            ? "Connect to like"
            : viewerLiked
              ? "❤️ Liked"
              : "♡ Like"}
      </button>
      <span className="likeCount">{count > 0 ? count.toLocaleString() : ""}</span>
      {visibleLikes.length > 0 && (
        <div className="likedBy" aria-label="Liked by">
          {visibleLikes.map((like) => (
            <span key={like.id}>
              {like.username
                ? `@${like.username}`
                : like.displayName ?? (like.address ? shortenAddress(like.address) : `FID ${like.fid}`)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function shortenAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
