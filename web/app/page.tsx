import Link from "next/link";
import type { FidTile } from "@/lib/pfps";
import { getPfpGallery, getPfpStats } from "@/lib/pfps";
import { FidCard } from "./fid-card";
import { LiveRefresh } from "./live-refresh";
import { SafeImage } from "./safe-image";

export const revalidate = 60;

export default async function Home() {
  const [tilesRaw, topTilesRaw, stats] = await Promise.all([
    getPfpGallery({ limit: 240, imagesPerFid: 5, sort: "newest" }),
    getPfpGallery({ limit: 8, imagesPerFid: 5, sort: "count" }),
    getPfpStats()
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
      <LiveRefresh renderedAt={new Date().toISOString()} />

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
            <FidCard key={tile.fid} tile={tile} />
          ))}
        </div>
      </section>
    </main>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}
