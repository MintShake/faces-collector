import { NextResponse } from "next/server";
import { getObjectStorageStats } from "@/lib/pfps";
import { corsHeaders, publicApiHeaders } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const stats = await getObjectStorageStats();
    return NextResponse.json({ ok: true, stats }, { headers: publicApiHeaders() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 503, headers: corsHeaders() });
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}
