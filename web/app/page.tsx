import { MiniAppHome } from "./miniapp-client";
import { LiveRefresh } from "./live-refresh";
import { getPfpGallery } from "@/lib/pfps";

export const dynamic = "force-dynamic";

export default async function Home() {
  const tiles = await getPfpGallery({ limit: 120, imagesPerFid: 5 });
  const totalImages = tiles.reduce((sum, tile) => sum + tile.imageCount, 0);

  return (
    <main className="shell">
      <LiveRefresh renderedAt={new Date().toISOString()} />
      <MiniAppHome tiles={tiles} totalImages={totalImages} />
    </main>
  );
}
