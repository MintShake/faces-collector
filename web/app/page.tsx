import Link from "next/link";
import { getPfpGalleryPage } from "@/lib/pfps";
import { getActivityLog, getLikeSummaryMap } from "@/lib/social";
import { ActivityFeed } from "./activity-feed";
import { HomeData, HeroStack } from "./home-data";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [activityEvents, recentPage, topPage, likeSummary] = await Promise.all([
    getActivityLog().catch(() => []),
    getPfpGalleryPage({ sort: "newest", limit: 14, imagesPerFid: 1, order: "desc" }).catch(() => ({ tiles: [], totalFids: 0, totalImages: 0 })),
    getPfpGalleryPage({ sort: "count", limit: 8, imagesPerFid: 5, order: "desc" }).catch(() => ({ tiles: [], totalFids: 0, totalImages: 0 })),
    getLikeSummaryMap().catch(() => ({}))
  ]);
  const heroImages = recentPage.tiles.flatMap((tile) => tile.images[0] ? [tile.images[0]] : []);
  const stats = {
    totalFids: recentPage.totalFids || topPage.totalFids,
    totalImages: recentPage.totalImages || topPage.totalImages,
    totalLikes: Object.values(likeSummary).reduce((sum, like) => sum + like.count, 0)
  };

  return (
    <main className="shell">
      <section className="miniHero">
        <div className="heroCopy">
          <span className="appMark">Faces</span>
          <h1>Every version of you, saved.</h1>
          <p>Profile picture history across the social web.</p>
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
        <HeroStack images={heroImages.slice(0, 5)} />
      </section>

      <HomeData stats={stats} recentTiles={recentPage.tiles} topTiles={topPage.tiles} />

      <ActivityFeed initial={activityEvents} />
    </main>
  );
}
