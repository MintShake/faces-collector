import { NextResponse } from "next/server";
import { corsHeaders } from "@/lib/api";
import { getPfpStats } from "@/lib/pfps";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      data: await getPfpStats()
    },
    {
      headers: corsHeaders()
    }
  );
}

export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders()
  });
}
