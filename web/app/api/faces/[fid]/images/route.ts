import { NextResponse } from "next/server";
import { clampNumber, corsHeaders, logApiRequest, publicApiHeaders } from "@/lib/api";
import { getFidTile } from "@/lib/pfps";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ fid: string }> }
) {
  const startedAt = Date.now();
  const limited = await rateLimit(request, {
    namespace: "faces:images",
    limit: 60,
    windowSeconds: 60
  });

  if (limited) {
    logApiRequest({ route: "faces.images", request, startedAt, status: 429, error: "rate_limited" });
    return limited;
  }

  const { fid } = await params;
  const numericFid = Number(fid);

  if (!Number.isInteger(numericFid) || numericFid <= 0) {
    logApiRequest({ route: "faces.images", request, startedAt, status: 400, error: "invalid_fid" });
    return json({ ok: false, error: "fid must be a positive integer" }, 400);
  }

  const url = new URL(request.url);
  const limit = clampNumber(url.searchParams.get("limit"), 1, 100, 50);
  const offset = clampNumber(url.searchParams.get("offset"), 0, 100_000, 0);
  const tile = await getFidTile(numericFid);

  if (!tile) {
    logApiRequest({ route: "faces.images", request, startedAt, status: 404, fid: numericFid, error: "not_found" });
    return json({ ok: false, error: "fid not found" }, 404);
  }

  const data = tile.images.slice(offset, offset + limit);
  logApiRequest({
    route: "faces.images",
    request,
    startedAt,
    fid: numericFid,
    count: data.length,
    totalImages: tile.imageCount
  });

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
    headers: status === 200 ? publicApiHeaders() : corsHeaders()
  });
}
