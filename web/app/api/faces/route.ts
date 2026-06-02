import { NextResponse } from "next/server";
import { getPfpGallery } from "@/lib/pfps";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = clampNumber(url.searchParams.get("limit"), 1, 500, 100);
  const imagesPerFid = clampNumber(url.searchParams.get("imagesPerFid"), 1, 20, 5);
  const tiles = await getPfpGallery({ limit, imagesPerFid });
  const totalImages = tiles.reduce((sum, tile) => sum + tile.imageCount, 0);

  return json({
    ok: true,
    count: tiles.length,
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

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    "Cache-Control": "no-store"
  };
}

function clampNumber(value: string | null, min: number, max: number, fallback: number) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}
