import { GalleryControls } from "./gallery-controls";
import { MiniAppHome } from "./miniapp-client";
import { getPfpGallery } from "@/lib/pfps";

export const dynamic = "force-dynamic";

export default async function Home() {
  const tiles = await getPfpGallery();
  const totalImages = tiles.reduce((sum, tile) => sum + tile.images.length, 0);

  return (
    <main className="shell">
      <MiniAppHome tiles={tiles} totalImages={totalImages} />

      {tiles.length > 0 ? (
        <GalleryControls tiles={tiles} />
      ) : (
        <section className="emptyState">
          <h2>No PFPs logged yet</h2>
          <p>Once the collector writes images to Blob, FID tiles will appear here.</p>
        </section>
      )}
    </main>
  );
}
