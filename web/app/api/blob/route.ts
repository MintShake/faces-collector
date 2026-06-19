import { list } from "@vercel/blob";
import { NextResponse } from "next/server";
import { clampNumber, corsHeaders, publicApiHeaders } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const limited = await rateLimit(request, {
    namespace: "blob:list",
    limit: 20,
    windowSeconds: 60
  });

  if (limited) {
    return limited;
  }

  const url = new URL(request.url);
  const prefix = url.searchParams.get("prefix") ?? "";
  const limit = clampNumber(url.searchParams.get("limit"), 1, 200, 100);
  const cursor = url.searchParams.get("cursor") ?? undefined;

  if (!isAllowedPrefix(prefix)) {
    return NextResponse.json({ ok: false, error: "prefix is not allowed" }, { status: 400, headers: corsHeaders() });
  }

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

function isAllowedPrefix(prefix: string) {
  return (
    prefix === "" ||
    prefix === "pfps/" ||
    /^pfps\/\d+\/?$/.test(prefix)
  );
}
