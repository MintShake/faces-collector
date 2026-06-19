import Link from "next/link";
import type { FidTile } from "@/lib/pfps";
import { GalleryControls } from "../gallery-controls";
import { getPfpGallery, getPfpStats } from "@/lib/pfps";

export const revalidate = 60;

export default async function BrowsePage() {
  // Skip expensive blob listing at build time — GalleryControls auto-fetches from API on mount.
  const isBuild = process.env.NEXT_PHASE === "phase-production-build";
  const [tiles, stats] = await Promise.all([
    isBuild ? Promise.resolve([] as FidTile[]) : getPfpGallery({ limit: 240, imagesPerFid: 5 }),
    isBuild
      ? Promise.resolve({ totalFids: 0, totalImages: 0, totalLikes: 0, newest: null, topTimeline: null, mostLiked: null })
      : getPfpStats()
  ]);

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <span className="appMark">Faces</span>
          <h1>Browse all profiles</h1>
          <p>
            {stats.totalFids > 0
              ? `${stats.totalFids.toLocaleString()} people and ${stats.totalImages.toLocaleString()} profile pics saved across the social web.`
              : "Profile picture history across the social web."}
          </p>
        </div>
        <Link className="backLink" href="/">
          Home
        </Link>
      </header>

      <GalleryControls
        tiles={tiles}
        initialTotalFids={stats.totalFids}
        initialTotalImages={stats.totalImages}
      />
    </main>
  );
}
