import { NextResponse } from "next/server";
import { clampNumber, corsHeaders } from "@/lib/api";
import { getFidTile } from "@/lib/pfps";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ fid: string }> }
) {
  const { fid } = await params;
  const numericFid = Number(fid);

  if (!Number.isInteger(numericFid) || numericFid <= 0) {
    return json({ ok: false, error: "fid must be a positive integer" }, 400);
  }

  const url = new URL(request.url);
  const limit = clampNumber(url.searchParams.get("limit"), 1, 500, 100);
  const offset = clampNumber(url.searchParams.get("offset"), 0, 100_000, 0);
  const tile = await getFidTile(numericFid);

  if (!tile) {
    return json({ ok: false, error: "fid not found" }, 404);
  }

  const data = tile.images.slice(offset, offset + limit);

  return json({
    ok: true,
    meta: {
      fid: numericFid,
      limit,
      offset,
      totalImages: tile.imageCount
    },
    count: data.length,
    data
  });
}

export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders()
  });
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: corsHeaders()
  });
}
