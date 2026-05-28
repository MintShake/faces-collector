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
          <h1>{user ? "Your PFP timeline" : "A living archive of Farcaster faces"}</h1>
          <p>
            {user
              ? `Welcome${user.username ? `, @${user.username}` : ""}. Faces checks your FID first, then lets you browse everyone else.`
              : "Open this in Farcaster to detect your FID, find your stored PFPs, and share your timeline."}
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
          <span className="eyebrow">Your FID</span>
          <h2>{user?.fid ? `FID ${user.fid}` : "Open in Farcaster"}</h2>
          <p>
            {userTile
              ? `${userTile.images.length.toLocaleString()} saved PFP${userTile.images.length === 1 ? "" : "s"} found in your timeline.`
              : user?.fid
                ? "You are identified. Showing your current Farcaster PFP until Faces archives your first change."
                : "The Mini App detects your Farcaster account automatically when opened inside Farcaster."}
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
          <p>FIDs logged</p>
        </div>
        <div>
          <span>{totalImages.toLocaleString()}</span>
          <p>PFP changes</p>
        </div>
        <div>
          <span>{user?.fid ? `FID ${user.fid}` : "Mini App"}</span>
          <p>{user?.username ? `@${user.username}` : "Open in Farcaster"}</p>
        </div>
      </section>

      {latestTiles.length > 0 ? (
        <section className="homeSection" aria-label="Recent PFP timelines">
          <div className="sectionHeading">
            <div>
              <span className="eyebrow">Browse others</span>
              <h2>Recently logged</h2>
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
