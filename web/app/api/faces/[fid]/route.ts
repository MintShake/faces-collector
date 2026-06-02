import { NextResponse } from "next/server";
import { getFidTile } from "@/lib/pfps";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ fid: string }> }
) {
  const { fid } = await params;
  const numericFid = Number(fid);

  if (!Number.isInteger(numericFid) || numericFid <= 0) {
    return json({ ok: false, error: "fid must be a positive integer" }, 400);
  }

  const tile = await getFidTile(numericFid);

  if (!tile) {
    return json({ ok: false, error: "fid not found" }, 404);
  }

  return json({
    ok: true,
    data: tile
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

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    "Cache-Control": "no-store"
  };
}
