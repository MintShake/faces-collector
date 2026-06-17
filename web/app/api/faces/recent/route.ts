import { NextResponse } from "next/server";
import { clampNumber, corsHeaders, logApiRequest, publicApiHeaders } from "@/lib/api";
import { getRecentPfpImages } from "@/lib/pfps";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const startedAt = Date.now();
  const url = new URL(request.url);
  const limit = clampNumber(url.searchParams.get("limit"), 1, 200, 50);
  const data = await getRecentPfpImages(limit);
  logApiRequest({
    route: "faces.recent",
    request,
    startedAt,
    count: data.length
  });

  return NextResponse.json(
    {
      ok: true,
      meta: { limit },
      count: data.length,
      data
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
