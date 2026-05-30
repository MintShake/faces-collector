import Link from "next/link";
import { GalleryControls } from "../gallery-controls";
import { LiveRefresh } from "../live-refresh";
import { getPfpGallery } from "@/lib/pfps";

export const dynamic = "force-dynamic";

export default async function BrowsePage() {
  const tiles = await getPfpGallery();
  const totalImages = tiles.reduce((sum, tile) => sum + tile.images.length, 0);

  return (
    <main className="shell">
      <LiveRefresh renderedAt={new Date().toISOString()} />
      <header className="topbar">
        <div>
          <span className="appMark">Memory wall</span>
          <h1>Browse every era</h1>
          <p>
            {tiles.length.toLocaleString()} people, {totalImages.toLocaleString()} saved PFP moments.
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
