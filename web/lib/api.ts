type CorsHeaderOptions = {
  cacheControl?: string;
};

type ApiRequestLog = {
  route: string;
  request: Request;
  startedAt: number;
  status?: number;
  count?: number;
  totalFids?: number;
  totalImages?: number;
  fid?: number;
  imageId?: string | null;
  imageKey?: string;
  error?: string;
};

export const PUBLIC_API_CACHE_CONTROL = "public, s-maxage=30, stale-while-revalidate=300";
export const PUBLIC_API_BROWSER_CACHE_CONTROL = "public, max-age=15";

export function corsHeaders(options: CorsHeaderOptions = {}) {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    "Cache-Control": options.cacheControl ?? "no-store"
  };
}

export function publicApiHeaders() {
  return {
    ...corsHeaders({ cacheControl: PUBLIC_API_BROWSER_CACHE_CONTROL }),
    "CDN-Cache-Control": PUBLIC_API_CACHE_CONTROL,
    "Vercel-CDN-Cache-Control": PUBLIC_API_CACHE_CONTROL
  };
}

export function clampNumber(value: string | null, min: number, max: number, fallback: number) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

export function logApiRequest(input: ApiRequestLog) {
  if (process.env.API_REQUEST_LOGGING === "false") {
    return;
  }

  const url = new URL(input.request.url);
  const forwardedFor = input.request.headers.get("x-forwarded-for");

  console.info(
    JSON.stringify({
      type: "faces_api_request",
      at: new Date().toISOString(),
      route: input.route,
      method: input.request.method,
      path: url.pathname,
      query: Object.fromEntries(url.searchParams.entries()),
      status: input.status ?? 200,
      durationMs: Date.now() - input.startedAt,
      count: input.count,
      totalFids: input.totalFids,
      totalImages: input.totalImages,
      fid: input.fid,
      imageId: input.imageId,
      imageKey: input.imageKey,
      origin: input.request.headers.get("origin"),
      referer: input.request.headers.get("referer"),
      userAgent: input.request.headers.get("user-agent"),
      clientIpPrefix: forwardedFor ? forwardedFor.split(",")[0]?.trim().split(".").slice(0, 2).join(".") : undefined,
      error: input.error
    })
  );
}
