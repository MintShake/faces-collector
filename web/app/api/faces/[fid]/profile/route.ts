import { NextResponse } from "next/server";
import { corsHeaders } from "@/lib/api";
import { getFidProfile } from "@/lib/pfps";

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

  const profile = await getFidProfile(numericFid);

  if (!profile) {
    return json({ ok: false, error: "profile not found" }, 404);
  }

  return json({
    ok: true,
    data: profile
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
