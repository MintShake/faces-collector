import Link from "next/link";
import { GalleryControls } from "../gallery-controls";
import { getPfpGallery } from "@/lib/pfps";

export const dynamic = "force-dynamic";

export default async function BrowsePage() {
  const tiles = await getPfpGallery();
  const totalImages = tiles.reduce((sum, tile) => sum + tile.images.length, 0);

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <span className="appMark">Browse</span>
          <h1>All PFP timelines</h1>
          <p>
            {tiles.length.toLocaleString()} FIDs, {totalImages.toLocaleString()} logged PFP changes.
          </p>
        </div>
        <Link className="backLink" href="/">
          Home
        </Link>
      </header>

      {tiles.length > 0 ? (
        <GalleryControls tiles={tiles} />
      ) : (
        <section className="emptyState">
          <h2>No PFPs logged yet</h2>
          <p>Once the collector writes images to storage, FID tiles will appear here.</p>
        </section>
      )}
    </main>
  );
}
