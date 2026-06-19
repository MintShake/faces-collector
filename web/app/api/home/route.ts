import { NextResponse } from "next/server";
import { getPfpGalleryPage } from "@/lib/pfps";
import { corsHeaders, logApiRequest, publicApiHeaders } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";
import { getLikeSummaryMap } from "@/lib/social";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const startedAt = Date.now();
  const limited = await rateLimit(request, {
    namespace: "home",
    limit: 120,
    windowSeconds: 60
  });

  if (limited) {
    logApiRequest({ route: "home", request, startedAt, status: 429, error: "rate_limited" });
    return limited;
  }

  const [recentPage, topPage, likeSummary] = await Promise.all([
    getPfpGalleryPage({ sort: "newest", limit: 10, imagesPerFid: 1, order: "desc" }),
    getPfpGalleryPage({ sort: "count", limit: 6, imagesPerFid: 4, order: "desc" }),
    getLikeSummaryMap()
  ]);
  const stats = {
    totalFids: recentPage.totalFids || topPage.totalFids,
    totalImages: recentPage.totalImages || topPage.totalImages,
    totalLikes: Object.values(likeSummary).reduce((sum, like) => sum + like.count, 0)
  };
  const recentChanges = recentPage.tiles
    .map((tile) => ({ fid: tile.fid, profile: tile.profile, image: tile.images[0] }))
    .filter((item) => Boolean(item.image));

  logApiRequest({
    route: "home",
    request,
    startedAt,
    count: recentChanges.length + topPage.tiles.length,
    totalFids: stats.totalFids,
    totalImages: stats.totalImages
  });

  return NextResponse.json(
    {
      ok: true,
      data: {
        stats,
        heroImages: recentChanges.slice(0, 5).map((item) => item.image),
        recentChanges,
        recentTiles: recentPage.tiles,
        topTiles: topPage.tiles
      }
    },
    {
      headers: publicApiHeaders()
    }
  );
}

export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders()
  });
}
