import { list } from "@vercel/blob";
import { NextResponse } from "next/server";
import { clampNumber, corsHeaders, publicApiHeaders } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const prefix = url.searchParams.get("prefix") ?? "";
  const limit = clampNumber(url.searchParams.get("limit"), 1, 1000, 100);
  const cursor = url.searchParams.get("cursor") ?? undefined;

  try {
    const page = await list({ prefix, limit, cursor });

    return NextResponse.json(
      {
        ok: true,
        blobs: page.blobs.map((b) => ({
          pathname: b.pathname,
          url: b.url,
          size: b.size,
          uploadedAt: b.uploadedAt,
        })),
        cursor: page.cursor ?? null,
        hasMore: !!page.cursor,
        count: page.blobs.length,
      },
      { headers: publicApiHeaders() }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 503, headers: corsHeaders() });
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}
