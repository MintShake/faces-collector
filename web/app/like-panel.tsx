"use client";

import { sdk } from "@farcaster/miniapp-sdk";
import { useEffect, useMemo, useState } from "react";
import type { PfpImage } from "@/lib/pfps";

type MiniAppUser = {
  fid: number;
  username?: string;
  displayName?: string;
  pfpUrl?: string;
};

type NotificationDetails = {
  url: string;
  token: string;
};

type LikeUser = MiniAppUser & {
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
  const [user, setUser] = useState<MiniAppUser>();
  const [notificationDetails, setNotificationDetails] = useState<NotificationDetails>();
  const [count, setCount] = useState(image.likeCount);
  const [viewerLiked, setViewerLiked] = useState(false);
  const [likes, setLikes] = useState<LikeUser[]>([]);
  const [busy, setBusy] = useState(false);
  const [storageUnavailable, setStorageUnavailable] = useState(false);
  const visibleLikes = useMemo(() => likes.slice(0, compact ? 3 : 8), [compact, likes]);

  useEffect(() => {
    let cancelled = false;

    async function loadContext() {
      if (compact) {
        return;
      }

      try {
        if (!(await sdk.isInMiniApp())) {
          return;
        }

        const context = await sdk.context;

        if (cancelled) {
          return;
        }

        setUser(context.user);
        setNotificationDetails(context.client.notificationDetails);
        await registerUser(context.user, context.client.notificationDetails);
      } catch {
        // Browser preview still works without Farcaster context.
      }
    }

    void loadContext();

    return () => {
      cancelled = true;
    };
  }, [compact]);

  useEffect(() => {
    let cancelled = false;

    async function loadLikes() {
      if (compact) {
        return;
      }

      const params = new URLSearchParams({ imageId: image.id });

      if (user?.fid) {
        params.set("viewerFid", String(user.fid));
      }

      const response = await fetch(`/api/likes?${params.toString()}`, {
        cache: "no-store"
      });

      if (!response.ok || cancelled) {
        return;
      }

      const data = await response.json() as LikeResponse;
      setCount(data.count);
      setViewerLiked(data.viewerLiked);
      setLikes(data.likes);
    }

    void loadLikes();

    return () => {
      cancelled = true;
    };
  }, [compact, image.id, user?.fid]);

  async function toggleLike() {
    let activeUser = user;
    let activeNotificationDetails = notificationDetails;

    if (!activeUser) {
      try {
        if (await sdk.isInMiniApp()) {
          const context = await sdk.context;
          activeUser = context.user;
          activeNotificationDetails = context.client.notificationDetails;
          setUser(context.user);
          setNotificationDetails(context.client.notificationDetails);
          await registerUser(context.user, context.client.notificationDetails);
        }
      } catch {
        return;
      }
    }

    if (!activeUser) {
      return;
    }

    setBusy(true);

    try {
      const response = await fetch("/api/likes", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          imageId: image.id,
          ownerFid,
          imageUrl: image.url,
          action: viewerLiked ? "unlike" : "like",
          user: activeUser,
          notificationDetails: activeNotificationDetails
        })
      });

      if (!response.ok) {
        if (response.status === 503) {
          setStorageUnavailable(true);
        }
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
      <button type="button" className={viewerLiked ? "likeButton active" : "likeButton"} onClick={toggleLike} disabled={busy}>
        {storageUnavailable ? "DB off" : viewerLiked ? "Liked" : "Like"}
      </button>
      <span className="likeCount">{count.toLocaleString()}</span>
      {visibleLikes.length > 0 && (
        <div className="likedBy" aria-label="Liked by">
          {visibleLikes.map((like) => (
            <span key={like.fid}>{like.username ? `@${like.username}` : like.displayName ?? `FID ${like.fid}`}</span>
          ))}
        </div>
      )}
    </div>
  );
}

async function registerUser(user: MiniAppUser, notificationDetails?: NotificationDetails) {
  await fetch("/api/users", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      ...user,
      notificationDetails
    })
  });
}
