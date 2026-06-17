import { NextResponse } from "next/server";
import { corsHeaders, logApiRequest, publicApiHeaders } from "@/lib/api";
import { getFidProfile } from "@/lib/pfps";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ fid: string }> }
) {
  const startedAt = Date.now();
  const { fid } = await params;
  const numericFid = Number(fid);

  if (!Number.isInteger(numericFid) || numericFid <= 0) {
    logApiRequest({ route: "faces.profile", request, startedAt, status: 400, error: "invalid_fid" });
    return json({ ok: false, error: "fid must be a positive integer" }, 400);
  }

  const profile = await getFidProfile(numericFid);

  if (!profile) {
    logApiRequest({ route: "faces.profile", request, startedAt, status: 404, fid: numericFid, error: "not_found" });
    return json({ ok: false, error: "profile not found" }, 404);
  }

  logApiRequest({
    route: "faces.profile",
    request,
    startedAt,
    fid: numericFid
  });

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
    headers: status === 200 ? publicApiHeaders() : corsHeaders()
  });
}
