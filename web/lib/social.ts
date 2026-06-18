import {
  GetObjectCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig
} from "@aws-sdk/client-s3";
import { Redis } from "@upstash/redis";

export type LikeUser = {
  id: string;
  fid?: number;
  address?: string;
  username?: string;
  displayName?: string;
  pfpUrl?: string;
  likedAt: string;
};

export type LikeSummary = {
  imageId: string;
  ownerFid: number;
  imageUrl: string;
  count: number;
  updatedAt: string;
};

export type ImageLikeRecord = LikeSummary & {
  likes: Record<string, LikeUser>;
};

export type NotificationDetails = {
  url: string;
  token: string;
};

export type RegisteredUser = {
  fid: number;
  username?: string;
  displayName?: string;
  pfpUrl?: string;
  notificationDetails?: NotificationDetails;
  updatedAt: string;
};

type LikeSummaryFile = {
  images: Record<string, LikeSummary>;
  updatedAt: string;
};

export type ActivityEvent = {
  id: string;
  type: "like" | "tip";
  at: string;
  actor?: {
    fid?: number;
    address?: string;
    username?: string;
    displayName?: string;
    pfpUrl?: string;
  };
  subject: {
    fid: number;
    username?: string;
    displayName?: string;
    imageId?: string;
    imageUrl?: string;
    amount?: number;
    txHash?: string;
  };
};

type ActivityLog = {
  events: ActivityEvent[];
  updatedAt: string;
};

const ACTIVITY_LOG_KEY = "social/activity-log.json";
const ACTIVITY_LOG_MAX = 60;

const LIKE_SUMMARY_CACHE_TTL_MS = 10_000;
let likeSummaryCache:
  | {
      expiresAt: number;
      promise: Promise<Record<string, LikeSummary>>;
    }
  | undefined;

export async function getLikeSummaryMap() {
  const now = Date.now();

  if (likeSummaryCache && likeSummaryCache.expiresAt > now) {
    return likeSummaryCache.promise;
  }

  const promise = safeGetJson<LikeSummaryFile>("social/likes-summary.json").then((summary) => summary?.images ?? {});
  likeSummaryCache = {
    expiresAt: now + LIKE_SUMMARY_CACHE_TTL_MS,
    promise
  };

  try {
    return await promise;
  } catch (error) {
    likeSummaryCache = undefined;
    throw error;
  }
}

export async function getImageLikes(imageId: string) {
  return safeGetJson<ImageLikeRecord>(likePath(imageId));
}

export async function getActivityLog(): Promise<ActivityEvent[]> {
  const log = await safeGetJson<ActivityLog>(ACTIVITY_LOG_KEY);
  return log?.events ?? [];
}

export async function appendActivityEvent(
  event: Omit<ActivityEvent, "id" | "at">
): Promise<void> {
  const now = new Date().toISOString();
  const log = (await safeGetJson<ActivityLog>(ACTIVITY_LOG_KEY)) ?? {
    events: [],
    updatedAt: now,
  };
  const newEvent: ActivityEvent = {
    id: `${event.type}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    at: now,
    ...event,
  };
  log.events = [newEvent, ...log.events].slice(0, ACTIVITY_LOG_MAX);
  log.updatedAt = now;
  await putJson(ACTIVITY_LOG_KEY, log);
}

export async function updateImageLike(input: {
  imageId: string;
  ownerFid: number;
  imageUrl: string;
  action: "like" | "unlike";
  user: Omit<LikeUser, "likedAt">;
}) {
  const now = new Date().toISOString();
  const existing = await getImageLikes(input.imageId);
  const likes = { ...(existing?.likes ?? {}) };
  const alreadyLiked = Boolean(likes[input.user.id]);

  if (input.action === "like") {
    likes[input.user.id] = {
      ...input.user,
      likedAt: likes[input.user.id]?.likedAt ?? now
    };
  } else {
    delete likes[input.user.id];
  }

  const record: ImageLikeRecord = {
    imageId: input.imageId,
    ownerFid: input.ownerFid,
    imageUrl: input.imageUrl,
    likes,
    count: Object.keys(likes).length,
    updatedAt: now
  };

  await putJson(likePath(input.imageId), record);
  await updateLikeSummary(record);

  if (input.action === "like" && !alreadyLiked) {
    try {
      const ownerProfile = await safeGetJson<RegisteredUser>(userPath(input.ownerFid));
      await appendActivityEvent({
        type: "like",
        actor: input.user.fid
          ? { fid: input.user.fid, username: input.user.username, displayName: input.user.displayName, pfpUrl: input.user.pfpUrl }
          : { address: input.user.address },
        subject: {
          fid: input.ownerFid,
          username: ownerProfile?.username,
          displayName: ownerProfile?.displayName,
          imageId: input.imageId,
          imageUrl: input.imageUrl,
        },
      });
    } catch { /* don't fail the like if log write fails */ }
  }

  return { record, alreadyLiked };
}

export async function registerMiniAppUser(input: {
  fid: number;
  username?: string;
  displayName?: string;
  pfpUrl?: string;
  notificationDetails?: NotificationDetails;
}) {
  const existing = await getRegisteredUser(input.fid);
  const updated: RegisteredUser = {
    fid: input.fid,
    username: input.username ?? existing?.username,
    displayName: input.displayName ?? existing?.displayName,
    pfpUrl: input.pfpUrl ?? existing?.pfpUrl,
    notificationDetails: input.notificationDetails ?? existing?.notificationDetails,
    updatedAt: new Date().toISOString()
  };

  await putJson(userPath(input.fid), updated);
  return updated;
}

export async function getRegisteredUser(fid: number) {
  return safeGetJson<RegisteredUser>(userPath(fid));
}

export async function notifyPfpOwner(input: {
  ownerFid: number;
  liker: Pick<LikeUser, "id" | "fid" | "address" | "username" | "displayName">;
  targetUrl: string;
}) {
  const owner = await getRegisteredUser(input.ownerFid);
  const details = owner?.notificationDetails;

  if (!details) {
    return { sent: false, reason: "owner-not-registered" };
  }

  const likerName = input.liker.username
    ? `@${input.liker.username}`
    : input.liker.displayName ?? (input.liker.address ? shortenAddress(input.liker.address) : `FID ${input.liker.fid}`);
  const response = await fetch(details.url, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      notificationId: `like-${input.ownerFid}-${input.liker.id}-${Date.now()}`.slice(0, 128),
      title: "New Faces like",
      body: `${likerName} liked one of your PFPs.`,
      targetUrl: input.targetUrl,
      tokens: [details.token]
    }),
    signal: AbortSignal.timeout(10_000)
  });

  if (!response.ok) {
    return { sent: false, reason: `${response.status} ${await response.text()}` };
  }

  return { sent: true };
}

async function updateLikeSummary(record: ImageLikeRecord) {
  likeSummaryCache = undefined;
  const now = new Date().toISOString();
  const summary = (await getJson<LikeSummaryFile>("social/likes-summary.json")) ?? {
    images: {},
    updatedAt: now
  };

  if (record.count > 0) {
    summary.images[record.imageId] = {
      imageId: record.imageId,
      ownerFid: record.ownerFid,
      imageUrl: record.imageUrl,
      count: record.count,
      updatedAt: record.updatedAt
    };
  } else {
    delete summary.images[record.imageId];
  }

  summary.updatedAt = now;
  await putJson("social/likes-summary.json", summary);
}

async function getJson<T>(key: string): Promise<T | undefined> {
  const redis = redisConfig();

  if (redis) {
    return (await redis.get<T>(key)) ?? undefined;
  }

  const storage = s3Config();

  if (!storage) {
    return undefined;
  }

  try {
    const response = await storage.client.send(
      new GetObjectCommand({
        Bucket: storage.bucket,
        Key: key
      })
    );
    const body = await response.Body?.transformToString();

    return body ? JSON.parse(body) as T : undefined;
  } catch (error) {
    if (error instanceof NoSuchKey || errorName(error) === "NoSuchKey" || errorName(error) === "NotFound") {
      return undefined;
    }

    throw error;
  }
}

async function safeGetJson<T>(key: string): Promise<T | undefined> {
  try {
    return await getJson<T>(key);
  } catch (error) {
    console.warn(`Could not read social store key ${key}: ${errorMessage(error)}`);
    return undefined;
  }
}

async function putJson(key: string, value: unknown) {
  const redis = redisConfig();

  if (redis) {
    await redis.set(key, value);
    return;
  }

  const storage = s3Config();

  if (!storage) {
    throw new Error("object storage is not configured");
  }

  await storage.client.send(
    new PutObjectCommand({
      Bucket: storage.bucket,
      Key: key,
      Body: JSON.stringify(value, null, 2),
      ContentType: "application/json",
      CacheControl: "no-store"
    })
  );
}

let cachedS3Client: S3Client | undefined;
let cachedRedis: Redis | undefined;

function redisConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    return undefined;
  }

  cachedRedis ??= new Redis({ url, token });
  return cachedRedis;
}

function s3Config() {
  const bucket =
    process.env.TIGRIS_BUCKET ??
    process.env.BUCKET_NAME ??
    process.env.B2_BUCKET ??
    process.env.S3_BUCKET;
  const endpoint =
    process.env.TIGRIS_ENDPOINT ??
    process.env.AWS_ENDPOINT_URL_S3 ??
    process.env.B2_ENDPOINT ??
    process.env.S3_ENDPOINT;
  const region =
    process.env.TIGRIS_REGION ??
    process.env.AWS_REGION ??
    process.env.B2_REGION ??
    process.env.S3_REGION ??
    "auto";
  const accessKeyId =
    process.env.TIGRIS_ACCESS_KEY_ID ??
    process.env.AWS_ACCESS_KEY_ID ??
    process.env.B2_KEY_ID ??
    process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey =
    process.env.TIGRIS_SECRET_ACCESS_KEY ??
    process.env.AWS_SECRET_ACCESS_KEY ??
    process.env.B2_APPLICATION_KEY ??
    process.env.S3_SECRET_ACCESS_KEY;

  if (!bucket || !endpoint || !accessKeyId || !secretAccessKey) {
    return undefined;
  }

  const clientConfig: S3ClientConfig = {
    endpoint,
    region,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true
  };

  cachedS3Client ??= new S3Client(clientConfig);

  return {
    bucket,
    client: cachedS3Client
  };
}

function likePath(imageId: string) {
  return `social/likes/${imageId}.json`;
}

function userPath(fid: number) {
  return `social/users/${fid}.json`;
}

function errorName(error: unknown) {
  return typeof error === "object" && error && "name" in error
    ? String(error.name)
    : undefined;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}

function shortenAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
