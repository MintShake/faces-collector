"use client";

import { sdk } from "@farcaster/miniapp-sdk";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { FidTile } from "@/lib/pfps";

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
  const featuredTiles = userTile
    ? [userTile, ...tiles.filter((tile) => tile.fid !== userTile.fid).slice(0, 5)]
    : tiles.slice(0, 6);

  useEffect(() => {
    let cancelled = false;

    async function bootMiniApp() {
      try {
        if (await sdk.isInMiniApp()) {
          const context = await sdk.context;

          if (!cancelled) {
            setUser(context.user);
          }

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
          <h1>Your PFP timeline</h1>
          <p>
            Faces watches Farcaster profile updates and turns every new PFP into a
            small, browsable history.
          </p>
        </div>

        <div className="heroStack" aria-hidden="true">
          {heroImages(userTile ?? tiles[0]).map((image, index) => (
            <img
              key={`${image.filename}-${index}`}
              src={image.thumbUrl ?? image.url}
              alt=""
              style={{ "--i": index } as React.CSSProperties}
            />
          ))}
        </div>
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

      {user && (
        <section className="yourTimeline" aria-label="Your PFP timeline">
          <div>
            <h2>{userTile ? "Your timeline is live" : "You are in the queue"}</h2>
            <p>
              {userTile
                ? `${userTile.images.length.toLocaleString()} PFP changes found for FID ${user.fid}.`
                : `FID ${user.fid} has been identified. Once the collector sees a profile update, your timeline appears here.`}
            </p>
          </div>
          {userTile && (
            <Link className="primaryButton" href={`/fid/${userTile.fid}`}>
              View all
            </Link>
          )}
        </section>
      )}

      {featuredTiles.length > 0 && (
        <section className="featuredRail" aria-label="Featured PFP timelines">
          {featuredTiles.map((tile) => (
            <Link className="miniTile" key={tile.fid} href={`/fid/${tile.fid}`}>
              <div className="miniThumbs">
                {tile.images.slice(0, 4).map((image, index) => (
                  <img
                    key={image.filename}
                    src={image.thumbUrl ?? image.url}
                    alt=""
                    style={{ "--i": index } as React.CSSProperties}
                  />
                ))}
              </div>
              <span>FID {tile.fid}</span>
              <strong>{tile.images.length.toLocaleString()}</strong>
            </Link>
          ))}
        </section>
      )}
    </>
  );
}

function heroImages(tile?: FidTile) {
  const images = tile?.images.slice(0, 5) ?? [];

  if (images.length > 0) {
    return images;
  }

  return [
    {
      filename: "fallback",
      url: "/miniapp/icon.png",
      size: 0,
      storedAt: new Date(0).toISOString()
    }
  ];
}
