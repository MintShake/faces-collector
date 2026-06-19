import Link from "next/link";
import { GalleryControls } from "../gallery-controls";
import { getPfpGallery, getPfpStats } from "@/lib/pfps";

export const dynamic = "force-dynamic";

export default async function BrowsePage() {
  const [tiles, stats] = await Promise.all([
    getPfpGallery({ limit: 240, imagesPerFid: 5 }),
    getPfpStats()
  ]);

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <span className="appMark">Faces</span>
          <h1>Browse all profiles</h1>
          <p>
            {stats.totalFids.toLocaleString()} people and {stats.totalImages.toLocaleString()} profile pics saved across the social web.
          </p>
        </div>
        <Link className="backLink" href="/">
          Home
        </Link>
      </header>

      {tiles.length > 0 ? (
        <GalleryControls
          tiles={tiles}
          initialTotalFids={stats.totalFids}
          initialTotalImages={stats.totalImages}
        />
      ) : (
        <section className="emptyState">
          <h2>Nothing here yet</h2>
          <p>Profiles appear as they're discovered. Check back soon.</p>
        </section>
      )}
    </main>
  );
}
