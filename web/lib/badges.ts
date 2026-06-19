import {
  GetObjectCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig
} from "@aws-sdk/client-s3";
import { NodeHttpHandler } from "@smithy/node-http-handler";

export type Badge = {
  id: string;
  label: string;
  awardedAt: string;
};

export type FidBadgeRecord = {
  fid: number;
  badges: Badge[];
  updatedAt: string;
};

type BadgeSummaryFile = {
  byFid: Record<string, Array<{ id: string; label: string }>>;
  updatedAt: string;
};

// Ordered from rarest → most common for display priority.
export const BADGE_DEFS: Record<string, { label: string; desc: string }> = {
  viral:     { label: "Viral",           desc: "50+ likes received" },
  icon:      { label: "Icon",            desc: "50+ profile pics saved" },
  og:        { label: "OG",              desc: "Tracked for over a year" },
  beloved:   { label: "Community fave",  desc: "10+ likes received" },
  pioneer:   { label: "Pioneer",         desc: "Early Farcaster adopter (FID ≤ 10k)" },
  chameleon: { label: "Chameleon",       desc: "10+ different looks saved" },
  power:     { label: "Power user",      desc: "Farcaster power badge holder" },
  verified:  { label: "Verified",        desc: "Has verified accounts" },
  fresh:     { label: "Fresh look",      desc: "Changed profile pic today" },
};

const BADGE_PRIORITY = Object.keys(BADGE_DEFS);

export function topBadge(badgeIds: string[]): string | undefined {
  for (const id of BADGE_PRIORITY) {
    if (badgeIds.includes(id)) return id;
  }
  return badgeIds[0];
}

const SUMMARY_CACHE_TTL_MS = 60_000;
let summaryCache: { expiresAt: number; promise: Promise<Record<string, Array<{ id: string; label: string }>>> } | undefined;

export async function getBadgeSummary(): Promise<Record<string, Array<{ id: string; label: string }>>> {
  const now = Date.now();
  if (summaryCache && summaryCache.expiresAt > now) return summaryCache.promise;

  const promise = safeGetJson<BadgeSummaryFile>("social/badges-summary.json")
    .then(f => f?.byFid ?? {});
  summaryCache = { expiresAt: now + SUMMARY_CACHE_TTL_MS, promise };

  try {
    return await promise;
  } catch {
    summaryCache = undefined;
    return {};
  }
}

export async function getFidBadges(fid: number): Promise<Badge[]> {
  const record = await safeGetJson<FidBadgeRecord>(`social/badges/${fid}.json`);
  return record?.badges ?? [];
}

export async function awardFidBadges(input: {
  fid: number;
  imageCount: number;
  totalLikes: number;
  latestImageAt?: string;
  firstSeenAt?: string;
  powerBadge?: boolean;
  verifications?: string[];
}): Promise<string[]> {
  const newIds = computeBadgeIds(input);

  const existing = await getFidBadges(input.fid);
  const existingById = new Map(existing.map(b => [b.id, b]));

  const now = new Date().toISOString();
  const merged: Badge[] = newIds.map(id => ({
    id,
    label: BADGE_DEFS[id]?.label ?? id,
    awardedAt: existingById.get(id)?.awardedAt ?? now
  }));

  const changed =
    merged.length !== existing.length ||
    merged.some(b => !existingById.has(b.id)) ||
    existing.some(b => !newIds.includes(b.id));

  if (changed) {
    const record: FidBadgeRecord = { fid: input.fid, badges: merged, updatedAt: now };
    await Promise.all([
      putJson(`social/badges/${input.fid}.json`, record),
      updateSummary(input.fid, merged)
    ]);
    summaryCache = undefined;
  }

  return newIds;
}

export function computeBadgeIds(input: {
  fid: number;
  imageCount: number;
  totalLikes: number;
  latestImageAt?: string;
  firstSeenAt?: string;
  powerBadge?: boolean;
  verifications?: string[];
}): string[] {
  const ids: string[] = [];
  const now = Date.now();

  if (input.totalLikes >= 50) ids.push("viral");
  if (input.imageCount >= 50) ids.push("icon");
  if (input.firstSeenAt && now - Date.parse(input.firstSeenAt) > 365 * 24 * 60 * 60 * 1000) ids.push("og");
  if (input.totalLikes >= 10 && input.totalLikes < 50) ids.push("beloved");
  if (input.fid <= 10000) ids.push("pioneer");
  if (input.imageCount >= 10 && input.imageCount < 50) ids.push("chameleon");
  if (input.powerBadge) ids.push("power");
  if (input.verifications && input.verifications.length > 0) ids.push("verified");
  if (input.latestImageAt && now - Date.parse(input.latestImageAt) < 24 * 60 * 60 * 1000) ids.push("fresh");

  return ids;
}

async function updateSummary(fid: number, badges: Badge[]) {
  const now = new Date().toISOString();
  const current = (await safeGetJson<BadgeSummaryFile>("social/badges-summary.json")) ?? {
    byFid: {},
    updatedAt: now
  };

  if (badges.length > 0) {
    current.byFid[String(fid)] = badges.map(b => ({ id: b.id, label: b.label }));
  } else {
    delete current.byFid[String(fid)];
  }
  current.updatedAt = now;
  await putJson("social/badges-summary.json", current);
}

async function getJson<T>(key: string): Promise<T | undefined> {
  const storage = s3Config();
  if (!storage) return undefined;

  try {
    const response = await storage.send(new GetObjectCommand({ Bucket: storageBucket(), Key: key }));
    const body = await response.Body?.transformToString();
    return body ? JSON.parse(body) as T : undefined;
  } catch (error) {
    if (error instanceof NoSuchKey) return undefined;
    const name = typeof error === "object" && error && "name" in error ? String((error as { name: unknown }).name) : "";
    if (name === "NoSuchKey" || name === "NotFound") return undefined;
    throw error;
  }
}

async function safeGetJson<T>(key: string): Promise<T | undefined> {
  try { return await getJson<T>(key); } catch { return undefined; }
}

async function putJson(key: string, value: unknown) {
  const storage = s3Config();
  if (!storage) throw new Error("Object storage not configured");

  await storage.send(new PutObjectCommand({
    Bucket: storageBucket(),
    Key: key,
    Body: JSON.stringify(value, null, 2),
    ContentType: "application/json",
    CacheControl: "no-store"
  }));
}

let cachedClient: S3Client | undefined;

function s3Config(): S3Client | undefined {
  const endpoint = process.env.TIGRIS_ENDPOINT ?? process.env.AWS_ENDPOINT_URL_S3 ?? process.env.S3_ENDPOINT;
  const accessKeyId = process.env.TIGRIS_ACCESS_KEY_ID ?? process.env.AWS_ACCESS_KEY_ID ?? process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.TIGRIS_SECRET_ACCESS_KEY ?? process.env.AWS_SECRET_ACCESS_KEY ?? process.env.S3_SECRET_ACCESS_KEY;
  const region = process.env.TIGRIS_REGION ?? process.env.AWS_REGION ?? "auto";

  if (!storageBucket() || !endpoint || !accessKeyId || !secretAccessKey) return undefined;

  const config: S3ClientConfig = {
    endpoint,
    region,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
    requestHandler: new NodeHttpHandler({
      connectionTimeout: 1_000,
      requestTimeout: 4_000
    })
  };
  cachedClient ??= new S3Client(config);
  return cachedClient;
}

function storageBucket() {
  return process.env.TIGRIS_BUCKET ?? process.env.BUCKET_NAME ?? process.env.S3_BUCKET ?? "";
}
