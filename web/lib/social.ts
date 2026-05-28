import {
  GetObjectCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig
} from "@aws-sdk/client-s3";
import { Redis } from "@upstash/redis";

export type LikeUser = {
  fid: number;
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

export async function getLikeSummaryMap() {
  const summary = await safeGetJson<LikeSummaryFile>("social/likes-summary.json");
  return summary?.images ?? {};
}

export async function getImageLikes(imageId: string) {
  return safeGetJson<ImageLikeRecord>(likePath(imageId));
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
  const alreadyLiked = Boolean(likes[input.user.fid]);

  if (input.action === "like") {
    likes[input.user.fid] = {
      ...input.user,
      likedAt: likes[input.user.fid]?.likedAt ?? now
    };
  } else {
    delete likes[input.user.fid];
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
  liker: Pick<LikeUser, "fid" | "username" | "displayName">;
  targetUrl: string;
}) {
  const owner = await getRegisteredUser(input.ownerFid);
  const details = owner?.notificationDetails;

  if (!details) {
    return { sent: false, reason: "owner-not-registered" };
  }

  const likerName = input.liker.username
    ? `@${input.liker.username}`
    : input.liker.displayName ?? `FID ${input.liker.fid}`;
  const response = await fetch(details.url, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      notificationId: `like-${input.ownerFid}-${input.liker.fid}-${Date.now()}`.slice(0, 128),
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
