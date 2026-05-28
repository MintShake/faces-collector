"use client";

import { sdk } from "@farcaster/miniapp-sdk";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { FidTile } from "@/lib/pfps";
import { AddAppButton } from "./add-app-button";
import { FidCard } from "./fid-card";
import { SafeImage } from "./safe-image";
import { ShareButton } from "./share-button";

type MiniAppUser = {
  fid: number;
  username?: string;
  displayName?: string;
  pfpUrl?: string;
};

export function MiniAppHome({
  tiles,
  totalImages
}: {
  tiles: FidTile[];
  totalImages: number;
}) {
  const [user, setUser] = useState<MiniAppUser>();
  const userTile = useMemo(
    () => (user ? tiles.find((tile) => tile.fid === user.fid) : undefined),
    [tiles, user]
  );
  const latestTiles = tiles.slice(0, 6);
  const heroTile = userTile ?? (user ? undefined : latestTiles[0]);
  const topMoment = latestTiles[0];

  useEffect(() => {
    let cancelled = false;

    async function bootMiniApp() {
      try {
        if (await sdk.isInMiniApp()) {
          const context = await sdk.context;

          if (!cancelled) {
            setUser(context.user);
          }

          await fetch("/api/users", {
            method: "POST",
            headers: {
              "content-type": "application/json"
            },
            body: JSON.stringify({
              ...context.user,
              notificationDetails: context.client.notificationDetails
            })
          });
          await sdk.actions.ready();
        }
      } catch {
        // Browser preview still works outside Farcaster.
      }
    }

    void bootMiniApp();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <section className="miniHero">
        <div className="heroCopy">
          <span className="appMark">Faces</span>
          <h1>{user ? "Your face, through every era" : "Every PFP has a before and after"}</h1>
          <p>
            {user
              ? `Welcome${user.username ? `, @${user.username}` : ""}. Your timeline lives first here, then the wider Farcaster memory wall opens up.`
              : "Faces saves the little identity shifts people forget: the icons, eras, jokes, glow-ups, and quiet resets that become a timeline."}
          </p>
          <div className="heroActions">
            {userTile ? (
              <Link className="primaryButton" href={`/fid/${userTile.fid}`}>
                View your timeline
              </Link>
            ) : (
              <Link className="primaryButton" href="/browse">
                Browse timelines
              </Link>
            )}
            {user && <AddAppButton user={user} />}
            <ShareButton fid={userTile?.fid} count={userTile?.images.length} />
          </div>
          <div className="memoryRibbon" aria-label="Faces highlights">
            <span>personal archive</span>
            <span>community memories</span>
            <span>PFP eras</span>
          </div>
        </div>

        <div className="heroStack" aria-hidden="true">
          {heroImages(heroTile, user).map((image, index) => (
            <SafeImage
              key={`${image.filename}-${index}`}
              src={image.thumbUrl ?? image.url}
              alt=""
              style={{ "--i": index } as React.CSSProperties}
            />
          ))}
        </div>
      </section>

      <section className="welcomePanel" aria-label="Your Faces status">
        <div>
          <span className="eyebrow">Start with you</span>
          <h2>{user?.fid ? `FID ${user.fid}` : "Open in Farcaster"}</h2>
          <p>
            {userTile
              ? `${userTile.images.length.toLocaleString()} saved PFP${userTile.images.length === 1 ? "" : "s"} in your personal timeline.`
              : user?.fid
                ? "You are identified. Faces is ready to catch your next chapter when your PFP changes."
                : "The Mini App detects your Farcaster account automatically and puts your own timeline first."}
          </p>
        </div>
        {userTile ? (
          <div className="welcomePreview">
            {userTile.images.slice(0, 4).map((image) => (
              <SafeImage key={image.filename} src={image.thumbUrl ?? image.url} alt="" />
            ))}
          </div>
        ) : (
          <div className={user?.pfpUrl ? "welcomePreview" : "welcomePreview placeholderPreview"} aria-hidden="true">
            {heroImages(heroTile, user).slice(0, 4).map((image) => (
              <SafeImage key={image.filename} src={image.thumbUrl ?? image.url} alt="" />
            ))}
          </div>
        )}
      </section>

      <section className="statsStrip" aria-label="Collection stats">
        <div>
          <span>{tiles.length.toLocaleString()}</span>
          <p>people remembered</p>
        </div>
        <div>
          <span>{totalImages.toLocaleString()}</span>
          <p>faces saved</p>
        </div>
        <div>
          <span>{topMoment ? `${topMoment.images.length}x` : "live"}</span>
          <p>{topMoment ? `biggest timeline: FID ${topMoment.fid}` : "watching new eras"}</p>
        </div>
      </section>

      {latestTiles.length > 0 ? (
        <section className="homeSection" aria-label="Recent PFP timelines">
          <div className="sectionHeading">
            <div>
              <span className="eyebrow">Memory wall</span>
              <h2>People changing in public</h2>
            </div>
            <Link className="textButton" href="/browse">
              View all
            </Link>
          </div>
          <div className="tileGrid homeGrid">
            {latestTiles.map((tile) => (
              <FidCard key={tile.fid} tile={tile} />
            ))}
          </div>
        </section>
      ) : (
        <section className="emptyState">
          <h2>No PFPs logged yet</h2>
          <p>Once the collector writes images to storage, FID tiles will appear here.</p>
        </section>
      )}
    </>
  );
}

function heroImages(tile?: FidTile, user?: MiniAppUser) {
  const images = tile?.images.slice(0, 5) ?? [];

  if (images.length > 0) {
    return images;
  }

  if (user?.pfpUrl) {
    return [
      {
        id: `current-${user.fid}`,
        filename: `current-${user.fid}`,
        url: user.pfpUrl,
        size: 0,
        storedAt: new Date(0).toISOString(),
        likeCount: 0
      }
    ];
  }

  return [
    {
      id: "fallback",
      filename: "fallback",
      url: "/miniapp/icon.png",
      size: 0,
      storedAt: new Date(0).toISOString(),
      likeCount: 0
    }
  ];
}
