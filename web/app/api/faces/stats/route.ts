import { NextResponse } from "next/server";
import { corsHeaders, logApiRequest, publicApiHeaders } from "@/lib/api";
import { getPfpStats } from "@/lib/pfps";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const startedAt = Date.now();
  const data = await getPfpStats();
  logApiRequest({
    route: "faces.stats",
    request,
    startedAt,
    totalFids: data.totalFids,
    totalImages: data.totalImages
  });

  return NextResponse.json(
    {
      ok: true,
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
