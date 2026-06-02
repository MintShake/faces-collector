import { NextResponse } from "next/server";
import { getPfpGallery } from "@/lib/pfps";
import { clampNumber, corsHeaders } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = clampNumber(url.searchParams.get("limit"), 1, 500, 100);
  const offset = clampNumber(url.searchParams.get("offset"), 0, 100_000, 0);
  const imagesPerFid = clampNumber(url.searchParams.get("imagesPerFid"), 1, 20, 5);
  const sort = parseSort(url.searchParams.get("sort"));
  const order = parseOrder(url.searchParams.get("order"));
  const query = url.searchParams.get("q")?.trim();
  const minImages = clampNumber(url.searchParams.get("minImages"), 1, 1000, 1);
  const allTiles = await getPfpGallery({
    imagesPerFid,
    sort,
    order,
    query,
    minImages
  });
  const tiles = allTiles.slice(offset, offset + limit);
  const totalImages = allTiles.reduce((sum, tile) => sum + tile.imageCount, 0);

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
    count: tiles.length,
    totalFids: allTiles.length,
    totalImages,
    data: tiles
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
    headers: corsHeaders()
  });
}

function parseSort(value: string | null) {
  if (value === "count" || value === "newest" || value === "oldest" || value === "fid" || value === "likes") {
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
