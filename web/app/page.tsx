import Link from "next/link";
import type { FidTile } from "@/lib/pfps";
import { getPfpGallery, getPfpStats } from "@/lib/pfps";
import { getActivityLog } from "@/lib/social";
import { ActivityFeed } from "./activity-feed";
import { FidCard } from "./fid-card";
import { SafeImage } from "./safe-image";

export const dynamic = "force-dynamic";

export default async function Home() {
  // Run gallery first so blob list is cached before the second call.
  const tilesRaw = await getPfpGallery({ limit: 240, imagesPerFid: 5, sort: "newest" });
  const [topTilesRaw, stats, activityEvents] = await Promise.all([
    getPfpGallery({ limit: 8, imagesPerFid: 5, sort: "count" }),
    getPfpStats(),
    getActivityLog(),
  ]);
  const tiles = tilesRaw as FidTile[];
  const topTiles = topTilesRaw as FidTile[];

  const recentChanges = tiles
    .flatMap((t) => t.images.map((img) => ({ fid: t.fid, profile: t.profile, image: img })))
    .sort((a, b) => Date.parse(b.image.storedAt) - Date.parse(a.image.storedAt))
    .slice(0, 14);

  const heroImages = recentChanges.slice(0, 5).map((c) => c.image);

  return (
    <main className="shell">
      <section className="miniHero">
        <div className="heroCopy">
          <span className="appMark">Faces</span>
          <h1>Every version of you, saved.</h1>
          <p>
            Profile picture history across the social web.{" "}
            {stats.totalFids.toLocaleString()} people and{" "}
            {stats.totalImages.toLocaleString()} moments — and counting.
          </p>
          <div className="heroActions">
            <Link className="primaryButton" href="/browse">
              Browse all faces
            </Link>
          </div>
          <div className="memoryRibbon">
            <span className="platformActive">Farcaster</span>
            <span className="platformSoon">Bluesky · soon</span>
            <span className="platformSoon">Lens · soon</span>
            <span className="platformSoon">X · soon</span>
          </div>
        </div>
        <div className="heroStack" aria-hidden="true">
          {heroImages.map((img, i) => (
            <SafeImage
              key={img.id}
              src={img.thumbUrl ?? img.url}
              alt=""
              style={{ "--i": i } as React.CSSProperties}
            />
          ))}
        </div>
      </section>

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

      <ActivityFeed initial={activityEvents} />

      <section className="homeInfoRow">
        <div className="infoCard tokenInfoCard">
          <span className="eyebrow">Token · Base</span>
          <h3>Faces Token</h3>
          <p>Hold it, earn it, tip it. More utility coming.</p>
          <code className="tokenAddressCompact">{TOKEN_ADDRESS}</code>
          <div className="infoCardLinks">
            <a href={`https://basescan.org/token/${TOKEN_ADDRESS}`} target="_blank" rel="noreferrer">BaseScan</a>
            <a href={`https://dexscreener.com/base/${TOKEN_ADDRESS}`} target="_blank" rel="noreferrer">DexScreener</a>
            <a href={`https://app.uniswap.org/explore/tokens/base/${TOKEN_ADDRESS}`} target="_blank" rel="noreferrer" className="infoCardPrimary">Trade</a>
          </div>
        </div>

        <a href="https://shakezzlab.xyz" target="_blank" rel="noreferrer" className="infoCard apiInfoCard">
          <span className="eyebrow">Open API</span>
          <h3>Faces Data API</h3>
          <p>Free, public, CORS-enabled. Profile pic history for every FID. No key needed.</p>
          <span className="infoCardCta">shakezzlab.xyz →</span>
        </a>
      </section>
    </main>
  );
}

const TOKEN_ADDRESS = "0xa199Ab829b992FD357E40F1E91be724D7273aa82";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}
