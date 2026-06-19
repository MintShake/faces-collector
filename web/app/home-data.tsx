import type { CSSProperties } from "react";
import Link from "next/link";
import type { FidTile, PfpImage } from "@/lib/pfps";
import { FidCard } from "./fid-card";
import { SafeImage } from "./safe-image";

export type HomeStats = { totalFids: number; totalImages: number; totalLikes: number };

export function HeroStack({ images }: { images: PfpImage[] }) {
  return (
    <div className="heroStack" aria-hidden="true">
      {images.filter(Boolean).map((img, i) => (
        <SafeImage
          key={img.id}
          src={img.thumbUrl ?? img.url}
          alt=""
          style={{ "--i": i } as CSSProperties}
        />
      ))}
    </div>
  );
}

export function HomeData({
  stats,
  recentTiles,
  topTiles
}: {
  stats: HomeStats;
  recentTiles: FidTile[];
  topTiles: FidTile[];
}) {
  return (
    <>
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
