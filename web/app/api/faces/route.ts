import { NextResponse } from "next/server";
import { getPfpGalleryPage } from "@/lib/pfps";
import { clampNumber, corsHeaders, logApiRequest, publicApiHeaders } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const startedAt = Date.now();
  const limited = await rateLimit(request, {
    namespace: "faces:list",
    limit: 60,
    windowSeconds: 60
  });

  if (limited) {
    logApiRequest({ route: "faces.list", request, startedAt, status: 429, error: "rate_limited" });
    return limited;
  }

  const url = new URL(request.url);
  const limit = clampNumber(url.searchParams.get("limit"), 1, 50, 50);
  const offset = clampNumber(url.searchParams.get("offset"), 0, 100_000, 0);
  const imagesPerFid = clampNumber(url.searchParams.get("imagesPerFid"), 1, 4, 3);
  const sort = parseSort(url.searchParams.get("sort"));
  const order = parseOrder(url.searchParams.get("order"));
  const query = url.searchParams.get("q")?.trim();
  const minImages = clampNumber(url.searchParams.get("minImages"), 1, 1000, 1);
  const page = await getPfpGalleryPage({
    limit,
    offset,
    imagesPerFid,
    sort,
    order,
    query,
    minImages
  });
  logApiRequest({
    route: "faces.list",
    request,
    startedAt,
    count: page.tiles.length,
    totalFids: page.totalFids,
    totalImages: page.totalImages
  });

  return json({
    ok: true,
    meta: {
      limit,
      offset,
      imagesPerFid,
      sort,
      order,
      q: query ?? null,
      minImages
    },
    count: page.tiles.length,
    totalFids: page.totalFids,
    totalImages: page.totalImages,
    data: page.tiles
  });
}

export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders()
  });
}

function json(body: unknown) {
  return NextResponse.json(body, {
    headers: publicApiHeaders()
  });
}

function parseSort(value: string | null) {
  if (value === "count" || value === "newest" || value === "oldest" || value === "fid" || value === "likes" || value === "score") {
    return value;
  }

  return "count";
}

function parseOrder(value: string | null) {
  if (value === "asc" || value === "desc") {
    return value;
  }

  return "desc";
}
