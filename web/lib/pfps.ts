import {
  GetObjectCommand,
  ListObjectsV2Command,
  S3Client,
  type S3ClientConfig
} from "@aws-sdk/client-s3";
import { list } from "@vercel/blob";
import { getLikeSummaryMap } from "./social";

export type PfpImage = {
  id: string;
  filename: string;
  url: string;
  thumbUrl?: string;
  mediumUrl?: string;
  size: number;
  storedAt: string;
  likeCount: number;
};

export type FidTile = {
  fid: number;
  images: PfpImage[];
  imageCount: number;
  profile?: FidProfile;
};

export type FidProfile = {
  fid: number;
  username?: string;
  displayName?: string;
  bio?: string;
  profileUrl?: string;
  pfpUrl?: string;
  firstSeenAt?: string;
  lastSeenAt?: string;
  lastProfileFetchedAt?: string;
  updatedAt?: string;
  followerCount?: number;
  neynarScore?: number;
  powerBadge?: boolean;
  verifications?: string[];
  farcasterScore?: number;
  neynarEnrichedAt?: string;
};

type GalleryOptions = {
  limit?: number;
  offset?: number;
  imagesPerFid?: number;
  sort?: "count" | "newest" | "oldest" | "fid" | "likes" | "score";
  order?: "asc" | "desc";
  query?: string;
  minImages?: number;
};

type ListedBlob = {
  pathname: string;
  url: string;
  size: number;
  uploadedAt: Date;
};

type BlobListCacheEntry = {
  expiresAt: number;
  promise: Promise<ListedBlob[]>;
};

const BLOB_LIST_CACHE_TTL_MS = 30_000;
const blobListCache = new Map<string, BlobListCacheEntry>();

type ScoreIndexCacheEntry = {
  expiresAt: number;
  promise: Promise<Record<string, number>>;
};

const SCORE_INDEX_CACHE_TTL_MS = 5 * 60_000;
let scoreIndexCache: ScoreIndexCacheEntry | undefined;

export async function getPfpGallery(options: GalleryOptions = {}) {
  return getBlobPfpGallery(options);
}

export async function getFidTile(fid: number): Promise<FidTile | undefined> {
  const gallery = await getBlobPfpGallery({ fid });
  const tile = gallery.find((item) => item.fid === fid);

  if (!tile) {
    return undefined;
  }

  return {
    ...tile,
    profile: await getFidProfile(fid)
  };
}

export async function getFidProfile(fid: number): Promise<FidProfile | undefined> {
  const s3 = s3Config();

  if (!s3) {
    return undefined;
  }

  try {
    const object = await s3.client.send(
      new GetObjectCommand({
        Bucket: s3.bucket,
        Key: `state/fids/${fid}.json`
      })
    );
    const text = await object.Body?.transformToString();

    if (!text) {
      return undefined;
    }

    const profile = JSON.parse(text) as FidProfile;

    return {
      fid,
      username: profile.username,
      displayName: profile.displayName,
      bio: profile.bio,
      profileUrl: profile.profileUrl,
      pfpUrl: profile.pfpUrl,
      firstSeenAt: profile.firstSeenAt,
      lastSeenAt: profile.lastSeenAt,
      lastProfileFetchedAt: profile.lastProfileFetchedAt,
      updatedAt: profile.updatedAt,
      followerCount: profile.followerCount,
      neynarScore: profile.neynarScore,
      powerBadge: profile.powerBadge,
      verifications: profile.verifications,
      farcasterScore: profile.farcasterScore,
      neynarEnrichedAt: profile.neynarEnrichedAt
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown profile read error";

    if (message.includes("NoSuchKey") || message.includes("404")) {
      return undefined;
    }

    console.warn(`Could not read profile for fid ${fid}: ${message}`);
    return undefined;
  }
}

export async function getRecentPfpImages(limit = 50) {
  const gallery = await getBlobPfpGallery();

  return gallery
    .flatMap((tile) => tile.images.map((image) => ({ fid: tile.fid, image })))
    .sort((a, b) => Date.parse(b.image.storedAt) - Date.parse(a.image.storedAt))
    .slice(0, limit);
}

export async function getPfpStats() {
  const gallery = await getBlobPfpGallery();
  const images = gallery.flatMap((tile) => tile.images.map((image) => ({ fid: tile.fid, image })));
  const newest = [...images].sort((a, b) => Date.parse(b.image.storedAt) - Date.parse(a.image.storedAt))[0];
  const topTimeline = [...gallery].sort((a, b) => b.imageCount - a.imageCount)[0];
  const mostLiked = [...images].sort((a, b) => b.image.likeCount - a.image.likeCount)[0];

  return {
    totalFids: gallery.length,
    totalImages: images.length,
    totalLikes: images.reduce((sum, item) => sum + item.image.likeCount, 0),
    newest: newest ?? null,
    topTimeline: topTimeline
      ? {
          fid: topTimeline.fid,
          imageCount: topTimeline.imageCount,
          latestImage: topTimeline.images[0]
        }
      : null,
    mostLiked: mostLiked && mostLiked.image.likeCount > 0 ? mostLiked : null
  };
}

export async function getObjectStorageStats() {
  const objects = await listAllBlobs("");
  const fidSet = new Set<string>();
  let allBytes = 0;
  let pfpBytes = 0;
  let pfpObjects = 0;
  let pfpImages = 0;
  let profileStates = 0;
  let socialObjects = 0;
  let newestPfp: { key: string; storedAt: string; size: number } | undefined;
  let newestProfileState: { key: string; storedAt: string; size: number } | undefined;

  for (const object of objects) {
    allBytes += object.size;

    const pfpMatch = object.pathname.match(/^pfps\/(\d+)\//);

    if (pfpMatch) {
      pfpObjects += 1;
      pfpBytes += object.size;
      fidSet.add(pfpMatch[1]);

      if (object.pathname.endsWith(".webp")) {
        pfpImages += 1;
        newestPfp = newestObject(newestPfp, object);
      }
    } else if (object.pathname.startsWith("state/fids/") && object.pathname.endsWith(".json")) {
      profileStates += 1;
      newestProfileState = newestObject(newestProfileState, object);
    } else if (object.pathname.startsWith("social/")) {
      socialObjects += 1;
    }
  }

  return {
    allObjects: objects.length,
    allBytes,
    allMb: bytesToMb(allBytes),
    pfpObjects,
    pfpBytes,
    pfpMb: bytesToMb(pfpBytes),
    pfpImages,
    uniqueFidsWithPfps: fidSet.size,
    profileStates,
    socialObjects,
    newestPfp: newestPfp ?? null,
    newestProfileState: newestProfileState ?? null
  };
}

async function getBlobPfpGallery(options: GalleryOptions & { fid?: number } = {}) {
  const [blobs, likeSummary, scoreIndex] = await Promise.all([
    listAllBlobs("pfps/"),
    getLikeSummaryMap(),
    options.sort === "score" ? getScoreIndex() : Promise.resolve({} as Record<string, number>)
  ]);
  const byFid = new Map<number, Map<string, Partial<PfpImage> & { filename: string; storedAt: string; size: number }>>();

  for (const blob of blobs) {
    const match = blob.pathname.match(/^pfps\/(\d+)\/(.+)\.(thumb|medium)\.webp$/i);

    if (!match) {
      continue;
    }

    const fid = Number(match[1]);

    if (options.fid && fid !== options.fid) {
      continue;
    }

    const basename = match[2];
    const imageId = imageIdFor(fid, basename);
    const variant = match[3].toLowerCase() as "thumb" | "medium";
    const images = byFid.get(fid) ?? new Map();
    const image = images.get(basename) ?? {
      id: imageId,
      filename: `${basename}.medium.webp`,
      url: blob.url,
      size: 0,
      storedAt: storedAtFromFilename(basename) ?? blob.uploadedAt.toISOString(),
      likeCount: likeSummary[imageId]?.count ?? 0
    };

    image.size += blob.size;

    if (variant === "thumb") {
      image.thumbUrl = blob.url;
    } else {
      image.url = blob.url;
      image.mediumUrl = blob.url;
    }

    images.set(basename, image);
    byFid.set(fid, images);
  }

  const tiles = [...byFid.entries()]
    .map(([fid, imageMap]) => {
      const images = [...imageMap.values()]
        .filter((image): image is PfpImage => Boolean(image.url))
        .map((image) => ({
          ...image,
          thumbUrl: image.thumbUrl ?? image.url,
          mediumUrl: image.mediumUrl ?? image.url
        }));

      images.sort((a, b) => Date.parse(b.storedAt) - Date.parse(a.storedAt));
      return {
        fid,
        imageCount: images.length,
        images: options.imagesPerFid ? images.slice(0, options.imagesPerFid) : images
      };
    })
    .filter((tile) => tile.images.length > 0)
    .filter((tile) => !options.query || String(tile.fid).includes(options.query))
    .filter((tile) => !options.minImages || tile.imageCount >= options.minImages)
    .sort((a, b) => compareTiles(a, b, options.sort ?? "count", options.order ?? "desc", scoreIndex));

  const offset = options.offset ?? 0;
  const limited = options.limit ? tiles.slice(offset, offset + options.limit) : tiles.slice(offset);

  return limited;
}

async function getScoreIndex(): Promise<Record<string, number>> {
  const now = Date.now();

  if (scoreIndexCache && scoreIndexCache.expiresAt > now) {
    return scoreIndexCache.promise;
  }

  const promise = fetchScoreIndexUncached();
  scoreIndexCache = { expiresAt: now + SCORE_INDEX_CACHE_TTL_MS, promise };

  try {
    return await promise;
  } catch {
    scoreIndexCache = undefined;
    return {};
  }
}

async function fetchScoreIndexUncached(): Promise<Record<string, number>> {
  const s3 = s3Config();

  if (!s3) return {};

  try {
    const object = await s3.client.send(
      new GetObjectCommand({
        Bucket: s3.bucket,
        Key: "state/score-index.json"
      })
    );
    const text = await object.Body?.transformToString();
    return text ? (JSON.parse(text) as Record<string, number>) : {};
  } catch {
    return {};
  }
}

async function listAllBlobs(prefix: string): Promise<ListedBlob[]> {
  const now = Date.now();
  const cached = blobListCache.get(prefix);

  if (cached && cached.expiresAt > now) {
    return cached.promise;
  }

  const promise = listAllBlobsUncached(prefix);
  blobListCache.set(prefix, {
    expiresAt: now + BLOB_LIST_CACHE_TTL_MS,
    promise
  });

  try {
    return await promise;
  } catch (error) {
    blobListCache.delete(prefix);
    throw error;
  }
}

async function listAllBlobsUncached(prefix: string): Promise<ListedBlob[]> {
  const s3 = s3Config();

  if (s3) {
    const blobs: ListedBlob[] = [];
    let continuationToken: string | undefined;

    try {
      do {
        const page = await s3.client.send(
          new ListObjectsV2Command({
            Bucket: s3.bucket,
            Prefix: prefix,
            MaxKeys: 1000,
            ContinuationToken: continuationToken
          })
        );

        for (const item of page.Contents ?? []) {
          if (!item.Key) {
            continue;
          }

          blobs.push({
            pathname: item.Key,
            url: publicObjectUrl(s3, item.Key),
            size: item.Size ?? 0,
            uploadedAt: item.LastModified ?? new Date(0)
          });
        }

        continuationToken = page.NextContinuationToken;
      } while (continuationToken);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown S3 list error";

      console.warn(`Could not list S3 PFPs: ${message}`);
      return [];
    }

    return blobs;
  }

  const blobs: ListedBlob[] = [];
  let cursor: string | undefined;

  do {
    const page = await list({
      prefix,
      limit: 1000,
      cursor
    });

    blobs.push(...page.blobs);
    cursor = page.cursor;
  } while (cursor);

  return blobs;
}

function newestObject(
  current: { key: string; storedAt: string; size: number } | undefined,
  object: { pathname: string; size: number; uploadedAt: Date }
) {
  if (current && Date.parse(current.storedAt) >= object.uploadedAt.getTime()) {
    return current;
  }

  return {
    key: object.pathname,
    storedAt: object.uploadedAt.toISOString(),
    size: object.size
  };
}

function bytesToMb(bytes: number) {
  return Number((bytes / 1024 / 1024).toFixed(2));
}

let cachedS3Client: S3Client | undefined;

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
    credentials: {
      accessKeyId,
      secretAccessKey
    },
    forcePathStyle: true
  };

  cachedS3Client ??= new S3Client(clientConfig);

  return {
    bucket,
    endpoint,
    publicBaseUrl:
      process.env.TIGRIS_PUBLIC_BASE_URL ??
      process.env.B2_PUBLIC_BASE_URL ??
      process.env.S3_PUBLIC_BASE_URL,
    client: cachedS3Client
  };
}

function publicObjectUrl(
  storage: { bucket: string; endpoint: string; publicBaseUrl?: string },
  pathname: string
) {
  const proxyBaseUrl = imageProxyBaseUrl();

  if (proxyBaseUrl && pathname.startsWith("pfps/")) {
    return `${proxyBaseUrl}/${pathname}`;
  }

  if (storage.publicBaseUrl) {
    return `${storage.publicBaseUrl.replace(/\/$/, "")}/${pathname}`;
  }

  return `${storage.endpoint.replace(/\/$/, "")}/${storage.bucket}/${pathname}`;
}

function imageProxyBaseUrl() {
  if (process.env.IMAGE_PROXY_DISABLED === "true") {
    return undefined;
  }

  if (process.env.IMAGE_PROXY_BASE_URL) {
    return process.env.IMAGE_PROXY_BASE_URL.replace(/\/$/, "");
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://web-legoblocksapps.vercel.app";
  return `${appUrl.replace(/\/$/, "")}/api/image`;
}

function newestTime(tile: FidTile) {
  return Date.parse(tile.images[0]?.storedAt ?? "0");
}

function oldestTime(tile: FidTile) {
  return Date.parse(tile.images.at(-1)?.storedAt ?? "0");
}

function totalLikes(tile: FidTile) {
  return tile.images.reduce((sum, image) => sum + image.likeCount, 0);
}

function compareTiles(
  a: FidTile,
  b: FidTile,
  sort: NonNullable<GalleryOptions["sort"]>,
  order: NonNullable<GalleryOptions["order"]>,
  scores: Record<string, number> = {}
) {
  const direction = order === "asc" ? 1 : -1;
  let result = 0;

  if (sort === "count") {
    result = a.imageCount - b.imageCount || newestTime(a) - newestTime(b);
  } else if (sort === "newest") {
    result = newestTime(a) - newestTime(b);
  } else if (sort === "oldest") {
    result = oldestTime(a) - oldestTime(b);
  } else if (sort === "likes") {
    result = totalLikes(a) - totalLikes(b) || newestTime(a) - newestTime(b);
  } else if (sort === "score") {
    result = (scores[String(a.fid)] ?? 0) - (scores[String(b.fid)] ?? 0);
  } else {
    result = a.fid - b.fid;
  }

  return result * direction;
}

function imageIdFor(fid: number, basename: string) {
  return `${fid}/${basename}`;
}

function storedAtFromFilename(filename: string) {
  const match = filename.match(/^(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)-/);

  if (!match) {
    return undefined;
  }

  return match[1].replace(
    /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/,
    "$1T$2:$3:$4.$5Z"
  );
}
