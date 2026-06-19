import { Redis } from "@upstash/redis";
import { NextResponse } from "next/server";

type RateLimitOptions = {
  namespace: string;
  limit: number;
  windowSeconds: number;
};

type MemoryBucket = {
  count: number;
  resetAt: number;
};

const memoryBuckets = new Map<string, MemoryBucket>();
const REDIS_RATE_LIMIT_TIMEOUT_MS = 500;
let cachedRedis: Redis | undefined;

export async function rateLimit(request: Request, options: RateLimitOptions) {
  const identifier = clientIdentifier(request);
  const key = `rate:${options.namespace}:${identifier}`;
  const now = Date.now();
  const windowMs = options.windowSeconds * 1000;
  const redis = redisConfig();
  let remaining = 0;
  let resetAt = now + windowMs;

  if (redis) {
    const count = await withTimeout(
      redis.incr(key),
      REDIS_RATE_LIMIT_TIMEOUT_MS,
      "redis rate limit increment timed out"
    ).catch((error) => {
      console.warn(error instanceof Error ? error.message : "redis rate limit increment failed");
      return undefined;
    });

    if (typeof count === "number") {
      if (count === 1) {
        await withTimeout(
          redis.expire(key, options.windowSeconds),
          REDIS_RATE_LIMIT_TIMEOUT_MS,
          "redis rate limit expiry timed out"
        ).catch((error) => {
          console.warn(error instanceof Error ? error.message : "redis rate limit expiry failed");
        });
      }

      remaining = Math.max(0, options.limit - count);
      resetAt = now + windowMs;

      if (count > options.limit) {
        return limitedResponse(options, remaining, resetAt);
      }

      return undefined;
    }
  }

  const current = memoryBuckets.get(key);
  const bucket = current && current.resetAt > now
    ? current
    : { count: 0, resetAt: now + windowMs };

  bucket.count += 1;
  memoryBuckets.set(key, bucket);
  remaining = Math.max(0, options.limit - bucket.count);
  resetAt = bucket.resetAt;

  if (memoryBuckets.size > 10_000) {
    for (const [entryKey, entry] of memoryBuckets) {
      if (entry.resetAt <= now) {
        memoryBuckets.delete(entryKey);
      }
    }
  }

  return bucket.count > options.limit
    ? limitedResponse(options, remaining, resetAt)
    : undefined;
}

function limitedResponse(options: RateLimitOptions, remaining: number, resetAt: number) {
  const retryAfter = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));

  return NextResponse.json(
    {
      ok: false,
      error: "rate_limited",
      retryAfter
    },
    {
      status: 429,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "content-type",
        "Retry-After": String(retryAfter),
        "X-RateLimit-Limit": String(options.limit),
        "X-RateLimit-Remaining": String(remaining),
        "X-RateLimit-Reset": String(Math.ceil(resetAt / 1000))
      }
    }
  );
}

function clientIdentifier(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const ip = forwardedFor?.split(",")[0]?.trim()
    ?? request.headers.get("x-real-ip")
    ?? "unknown";
  const userAgent = request.headers.get("user-agent") ?? "unknown";

  return `${ip}:${hashString(userAgent)}`;
}

function redisConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    return undefined;
  }

  cachedRedis ??= new Redis({ url, token });
  return cachedRedis;
}

function hashString(value: string) {
  let hash = 5381;

  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 33) ^ value.charCodeAt(i);
  }

  return (hash >>> 0).toString(36);
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(message)), timeoutMs);
    })
  ]);
}
