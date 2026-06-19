import Link from "next/link";
import { getPfpGalleryPage } from "@/lib/pfps";
import { GalleryControls } from "../gallery-controls";

const initialPageSize = 50;

export const dynamic = "force-dynamic";

export default async function BrowsePage() {
  const initialPage = await getPfpGalleryPage({
    limit: initialPageSize,
    imagesPerFid: 3,
    sort: "likes",
    order: "desc"
  }).catch(() => ({ tiles: [], totalFids: 0, totalImages: 0 }));

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <span className="appMark">Faces</span>
          <h1>Browse all profiles</h1>
          <p>Profile picture history across the social web.</p>
        </div>
        <Link className="backLink" href="/">
          Home
        </Link>
      </header>

      <GalleryControls
        tiles={initialPage.tiles}
        initialTotalFids={initialPage.totalFids}
        initialTotalImages={initialPage.totalImages}
      />
    </main>
  );
}
