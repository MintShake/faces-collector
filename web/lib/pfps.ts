import {
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig
} from "@aws-sdk/client-s3";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import { get, list } from "@vercel/blob";
import { getLikeSummaryMap, getPendingReportedImageIds } from "./social";
import { BADGE_DEFS, getBadgeSummary, awardFidBadges } from "./badges";

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

export type TileBadge = {
  id: string;
  label: string;
};

export type FidTile = {
  fid: number;
  images: PfpImage[];
  imageCount: number;
  profile?: FidProfile;
  badges?: TileBadge[];
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
  includeProfiles?: boolean;
};

export type PfpGalleryPage = {
  tiles: FidTile[];
  totalFids: number;
  totalImages: number;
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

const BLOB_LIST_CACHE_TTL_MS = 600_000;
const blobListCache = new Map<string, BlobListCacheEntry>();
const GALLERY_INDEX_PATH = "state/index/gallery.json";
const GALLERY_INDEX_CACHE_TTL_MS = 300_000;
const STORAGE_READ_TIMEOUT_MS = 2_000;
const PROFILE_READ_TIMEOUT_MS = 350;

type GalleryIndexImage = {
  id: string;
  filename: string;
  pathname: string;
  thumbPathname?: string;
  mediumPathname?: string;
  size: number;
  storedAt: string;
};

type GalleryIndexEntry = {
  fid: number;
  imageCount: number;
  newestAt: string;
  oldestAt: string;
  profile?: FidProfile;
  images: GalleryIndexImage[];
};

type GalleryIndex = {
  version: 1;
  generatedAt: string;
  totalFids: number;
  totalImages: number;
  entries: GalleryIndexEntry[];
};

type GalleryIndexCacheEntry = {
  expiresAt: number;
  promise: Promise<GalleryIndex | undefined>;
};

let galleryIndexCache: GalleryIndexCacheEntry | undefined;

type ScoreIndexCacheEntry = {
  expiresAt: number;
  promise: Promise<Record<string, number>>;
};

const SCORE_INDEX_CACHE_TTL_MS = 5 * 60_000;
let scoreIndexCache: ScoreIndexCacheEntry | undefined;

export async function getPfpGallery(options: GalleryOptions = {}) {
  const page = await getBlobPfpGallery(options);
  return page.tiles;
}

export async function getPfpGalleryPage(options: GalleryOptions = {}) {
  return getBlobPfpGallery(options);
}

export async function getFidTile(fid: number): Promise<FidTile | undefined> {
  const gallery = await getBlobPfpGallery({ fid });
  const tile = gallery.tiles.find((item) => item.fid === fid);

  if (!tile) {
    return undefined;
  }

  const profile = await getFidProfile(fid);

  const totalLikes = tile.images.reduce((sum, img) => sum + img.likeCount, 0);
  const latestImageAt = tile.images[0]?.storedAt;

  const awardedIds = await awardFidBadges({
    fid,
    imageCount: tile.imageCount,
    totalLikes,
    latestImageAt,
    firstSeenAt: profile?.firstSeenAt,
    powerBadge: profile?.powerBadge,
    verifications: profile?.verifications
  });

  const badges: TileBadge[] = awardedIds.map(id => ({
    id,
    label: BADGE_DEFS[id]?.label ?? id
  }));

  return {
    ...tile,
    profile,
    badges: badges.length > 0 ? badges : undefined
  };
}

const profileCache = new Map<number, { expiresAt: number; value: FidProfile | undefined }>();
const PROFILE_CACHE_TTL_MS = 60_000;

export async function getFidProfile(fid: number): Promise<FidProfile | undefined> {
  const now = Date.now();
  const cached = profileCache.get(fid);
  if (cached && cached.expiresAt > now) return cached.value;

  const s3 = s3Config();

  if (!s3) {
    return undefined;
  }

  try {
    const object = await s3.client.send(
      new GetObjectCommand({
        Bucket: s3.bucket,
        Key: `state/fids/${fid}.json`
      }),
      {
        abortSignal: AbortSignal.timeout(PROFILE_READ_TIMEOUT_MS)
      }
    );
    const text = await object.Body?.transformToString();

    const cache = (v: FidProfile | undefined) => {
      profileCache.set(fid, { expiresAt: Date.now() + PROFILE_CACHE_TTL_MS, value: v });
      return v;
    };

    if (!text) return cache(undefined);

    const profile = JSON.parse(text) as FidProfile;
    const result: FidProfile = {
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

    return cache(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown profile read error";

    if (message.includes("NoSuchKey") || message.includes("404")) {
      profileCache.set(fid, { expiresAt: Date.now() + PROFILE_CACHE_TTL_MS, value: undefined });
      return undefined;
    }

    console.warn(`Could not read profile for fid ${fid}: ${message}`);
    return undefined;
  }
}

async function bulkEnrichProfiles(fids: number[]) {
  const s3 = s3Config();
  if (!s3) return new Map<number, FidProfile>();

  const neynarKey = process.env.NEYNAR_API_KEY;
  type NeynarUser = { fid: number; username?: string; display_name?: string; pfp_url?: string };
  const enriched = new Map<number, { username?: string; displayName?: string; pfpUrl?: string }>();
  const profiles = new Map<number, FidProfile>();

  // Neynar bulk endpoint — up to 100 FIDs per call.
  if (neynarKey) {
    for (let i = 0; i < fids.length; i += 100) {
      const batch = fids.slice(i, i + 100);
      try {
        const res = await fetch(
          `https://api.neynar.com/v2/farcaster/user/bulk?fids=${batch.join(",")}`,
          {
            headers: { accept: "application/json", "x-api-key": neynarKey },
            signal: AbortSignal.timeout(1_800)
          }
        );
        if (res.ok) {
          const data = await res.json() as { users?: NeynarUser[] };
          for (const u of data.users ?? []) {
            enriched.set(u.fid, { username: u.username, displayName: u.display_name, pfpUrl: u.pfp_url });
          }
        }
      } catch { /* skip batch on error */ }
    }
  }

  // Write enriched profiles back to storage and update cache.
  await Promise.all([...enriched.entries()].map(async ([fid, names]) => {
    try {
      const existing = profileCache.get(fid)?.value;
      const merged: FidProfile = {
        ...(existing ?? { fid }),
        fid,
        username:    names.username    ?? existing?.username,
        displayName: names.displayName ?? existing?.displayName,
        pfpUrl:      names.pfpUrl      ?? existing?.pfpUrl,
      };
      await s3.client.send(new PutObjectCommand({
        Bucket: s3.bucket,
        Key: `state/fids/${fid}.json`,
        Body: JSON.stringify(merged),
        ContentType: "application/json",
      }));
      profileCache.set(fid, { expiresAt: Date.now() + PROFILE_CACHE_TTL_MS, value: merged });
      profiles.set(fid, merged);
    } catch { /* ignore */ }
  }));

  return profiles;
}

export async function getRecentPfpImages(limit = 50) {
  const index = await getGalleryIndex();

  if (index) {
    const [likeSummary, hiddenImageIds] = await Promise.all([
      getLikeSummaryMap(),
      getPendingReportedImageIds()
    ]);
    return index.entries
      .flatMap((entry) => entry.images.map((image) => ({
        fid: entry.fid,
        image: imageFromIndex(image, likeSummary)
      })))
      .filter((item) => !hiddenImageIds.has(item.image.id))
      .sort((a, b) => Date.parse(b.image.storedAt) - Date.parse(a.image.storedAt))
      .slice(0, limit);
  }

  const { tiles: gallery } = await getBlobPfpGallery();

  return gallery
    .flatMap((tile) => tile.images.map((image) => ({ fid: tile.fid, image })))
    .sort((a, b) => Date.parse(b.image.storedAt) - Date.parse(a.image.storedAt))
    .slice(0, limit);
}

export async function getPfpStats() {
  const index = await getGalleryIndex();

  if (index) {
    const [likeSummary, hiddenImageIds] = await Promise.all([
      getLikeSummaryMap(),
      getPendingReportedImageIds()
    ]);
    let totalLikes = 0;
    let totalFids = 0;
    let totalImages = 0;
    let newest: { fid: number; image: PfpImage } | undefined;
    let mostLiked: { fid: number; image: PfpImage } | undefined;
    let topTimeline: { fid: number; imageCount: number; latestImage?: PfpImage } | undefined;

    for (const entry of index.entries) {
      const visibleImages = entry.images
        .map((indexedImage) => imageFromIndex(indexedImage, likeSummary))
        .filter((image) => !hiddenImageIds.has(image.id));

      if (visibleImages.length === 0) continue;

      totalFids += 1;
      totalImages += visibleImages.length;

      if (!topTimeline || visibleImages.length > topTimeline.imageCount) {
        topTimeline = {
          fid: entry.fid,
          imageCount: visibleImages.length,
          latestImage: visibleImages[0]
        };
      }

      for (const image of visibleImages) {
        totalLikes += image.likeCount;

        if (!newest || Date.parse(image.storedAt) > Date.parse(newest.image.storedAt)) {
          newest = { fid: entry.fid, image };
        }

        if (!mostLiked || image.likeCount > mostLiked.image.likeCount) {
          mostLiked = { fid: entry.fid, image };
        }
      }
    }

    return {
      totalFids,
      totalImages,
      totalLikes,
      newest: newest ?? null,
      topTimeline: topTimeline
        ? {
            fid: topTimeline.fid,
            imageCount: topTimeline.imageCount,
            latestImage: topTimeline.latestImage
          }
        : null,
      mostLiked: mostLiked && mostLiked.image.likeCount > 0 ? mostLiked : null
    };
  }

  const { tiles: gallery } = await getBlobPfpGallery();
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

async function getBlobPfpGallery(options: GalleryOptions & { fid?: number } = {}): Promise<PfpGalleryPage> {
  if (!options.fid) {
    const indexed = await getIndexedPfpGallery(options);
    if (indexed) return indexed;

    console.warn("Gallery index unavailable; skipping broad blob scan for public gallery request.");
    return { tiles: [], totalFids: 0, totalImages: 0 };
  }

  // Use fid-specific prefix when fetching a single profile — avoids scanning all blobs.
  const blobPrefix = options.fid ? `pfps/${options.fid}/` : "pfps/";
  const [blobs, likeSummary, badgeSummary, scoreIndex, hiddenImageIds] = await Promise.all([
    listAllBlobs(blobPrefix),
    getLikeSummaryMap(),
    options.fid ? Promise.resolve({} as Record<string, Array<{ id: string; label: string }>>) : getBadgeSummary(),
    options.sort === "score" ? getScoreIndex() : Promise.resolve({} as Record<string, number>),
    getPendingReportedImageIds()
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
        .filter((image) => !hiddenImageIds.has(image.id))
        .map((image) => ({
          ...image,
          thumbUrl: image.thumbUrl ?? image.url,
          mediumUrl: image.mediumUrl ?? image.url
        }));

      images.sort((a, b) => Date.parse(b.storedAt) - Date.parse(a.storedAt));
      const badges = badgeSummary[String(fid)] ?? [];
      return {
        fid,
        imageCount: images.length,
        images: options.imagesPerFid ? images.slice(0, options.imagesPerFid) : images,
        badges: badges.length > 0 ? badges : undefined
      };
    })
    .filter((tile) => tile.images.length > 0)
    .filter((tile) => !options.minImages || tile.imageCount >= options.minImages)
    .sort((a, b) => compareTiles(a, b, options.sort ?? "count", options.order ?? "desc", scoreIndex));

  // Apply query filter — numeric matches FID, text searches indexed profile names.
  let filtered = tiles;
  if (options.query) {
    const q = options.query.toLowerCase();
    if (/^\d+$/.test(q)) {
      filtered = tiles.filter((t) => String(t.fid).includes(q));
    } else {
      filtered = tiles.filter((tile) =>
        profileMatchesQuery((tile as { profile?: FidProfile }).profile, q)
      );
    }
  }

  const offset = options.offset ?? 0;
  const limited = options.limit ? filtered.slice(offset, offset + options.limit) : filtered.slice(offset);
  const totalFids = filtered.length;
  const totalImages = filtered.reduce((sum, tile) => sum + tile.imageCount, 0);

  // Attach profiles for tiles that don't already have one (search path already fetches them).
  const withProfiles = await Promise.all(
    limited.map(async (tile) => {
      if ((tile as FidTile).profile) return tile as FidTile;
      const profile = await getFidProfile(tile.fid);
      return profile ? { ...tile, profile } : (tile as FidTile);
    })
  );

  return {
    tiles: withProfiles,
    totalFids,
    totalImages
  };
}

async function getIndexedPfpGallery(options: GalleryOptions = {}): Promise<PfpGalleryPage | undefined> {
  const index = await getGalleryIndex();

  if (!index) {
    return undefined;
  }

  const [likeSummary, badgeSummary, scoreIndex, hiddenImageIds] = await Promise.all([
    getLikeSummaryMap(),
    getBadgeSummary(),
    options.sort === "score" ? getScoreIndex() : Promise.resolve({} as Record<string, number>),
    getPendingReportedImageIds()
  ]);
  const tiles = index.entries
    .map((entry) => {
      const images = entry.images
        .map((image) => imageFromIndex(image, likeSummary))
        .filter((image) => !hiddenImageIds.has(image.id))
        .sort((a, b) => Date.parse(b.storedAt) - Date.parse(a.storedAt));
      const badges = badgeSummary[String(entry.fid)] ?? [];

      return {
        fid: entry.fid,
        profile: entry.profile,
        imageCount: images.length,
        images: options.imagesPerFid ? images.slice(0, options.imagesPerFid) : images,
        badges: badges.length > 0 ? badges : undefined
      };
    })
    .filter((tile) => tile.images.length > 0)
    .filter((tile) => !options.minImages || tile.imageCount >= options.minImages)
    .sort((a, b) => compareTiles(a, b, options.sort ?? "count", options.order ?? "desc", scoreIndex));

  let filtered = tiles;
  if (options.query) {
    const q = options.query.toLowerCase();
    if (/^\d+$/.test(q)) {
      filtered = tiles.filter((t) => String(t.fid).includes(q));
    } else {
      filtered = tiles.filter((tile) => profileMatchesQuery(tile.profile, q));
    }
  }

  const offset = options.offset ?? 0;
  const limited = options.limit ? filtered.slice(offset, offset + options.limit) : filtered.slice(offset);
  const totalFids = filtered.length;
  const totalImages = filtered.reduce((sum, tile) => sum + tile.imageCount, 0);
  const withProfiles = options.includeProfiles === false
    ? limited as FidTile[]
    : await Promise.all(
        limited.map(async (tile) => {
          if ((tile as FidTile).profile) return tile as FidTile;
          const profile = await getFidProfile(tile.fid);
          return profile ? { ...tile, profile } : (tile as FidTile);
        })
      );

  const shouldEnrichMissingNames =
    options.includeProfiles !== false &&
    process.env.NEXT_PHASE !== "phase-production-build" &&
    withProfiles.some((tile) => !tile.profile?.username && !tile.profile?.displayName);

  if (shouldEnrichMissingNames) {
    const enriched = await bulkEnrichProfiles(
      withProfiles
        .filter((tile) => !tile.profile?.username && !tile.profile?.displayName)
        .map((tile) => tile.fid)
    );

    for (const tile of withProfiles) {
      const profile = enriched.get(tile.fid);
      if (profile) {
        tile.profile = profile;
      }
    }
  }

  return {
    tiles: withProfiles,
    totalFids,
    totalImages
  };
}

function imageFromIndex(
  image: GalleryIndexImage,
  likeSummary: Record<string, { count: number } | undefined>
): PfpImage {
  const mediumPathname = image.mediumPathname ?? image.pathname;
  const thumbPathname = image.thumbPathname ?? mediumPathname;
  const mediumUrl = objectUrlForPathname(mediumPathname);
  const thumbUrl = objectUrlForPathname(thumbPathname);

  return {
    id: image.id,
    filename: image.filename,
    url: mediumUrl,
    mediumUrl,
    thumbUrl,
    size: image.size,
    storedAt: image.storedAt,
    likeCount: likeSummary[image.id]?.count ?? 0
  };
}

function profileMatchesQuery(profile: FidProfile | undefined, query: string) {
  return Boolean(
    profile?.username?.toLowerCase().includes(query) ||
    profile?.displayName?.toLowerCase().includes(query)
  );
}

async function getGalleryIndex(): Promise<GalleryIndex | undefined> {
  const now = Date.now();

  if (galleryIndexCache && galleryIndexCache.expiresAt > now) {
    return galleryIndexCache.promise;
  }

  const promise = fetchGalleryIndexUncached();
  galleryIndexCache = {
    expiresAt: now + GALLERY_INDEX_CACHE_TTL_MS,
    promise
  };

  try {
    return await promise;
  } catch (error) {
    galleryIndexCache = undefined;
    const message = error instanceof Error ? error.message : "Unknown gallery index error";
    console.warn(`Could not read gallery index: ${message}`);
    return undefined;
  }
}

async function fetchGalleryIndexUncached(): Promise<GalleryIndex | undefined> {
  const s3 = s3Config();

  if (s3) {
    try {
      const object = await s3.client.send(
        new GetObjectCommand({
          Bucket: s3.bucket,
          Key: GALLERY_INDEX_PATH
        }),
        {
          abortSignal: AbortSignal.timeout(STORAGE_READ_TIMEOUT_MS)
        }
      );
      const text = await object.Body?.transformToString();
      const parsed = text ? (JSON.parse(text) as GalleryIndex) : undefined;
      return isGalleryIndex(parsed) ? parsed : undefined;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown S3 read error";
      const name = error instanceof Error ? error.name : "";

      if (name === "NoSuchKey" || message.includes("NoSuchKey") || message.includes("404")) {
        return undefined;
      }

      throw error;
    }
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return undefined;
  }

  const blob = await get(GALLERY_INDEX_PATH, {
    access: "public",
    useCache: false
  });

  if (!blob || blob.statusCode !== 200) {
    return undefined;
  }

  const text = await new Response(blob.stream).text();
  const parsed = JSON.parse(text) as GalleryIndex;
  return isGalleryIndex(parsed) ? parsed : undefined;
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
    forcePathStyle: true,
    requestHandler: new NodeHttpHandler({
      connectionTimeout: 1_000,
      requestTimeout: 4_000
    })
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

function objectUrlForPathname(pathname: string) {
  const s3 = s3Config();

  if (s3) {
    return publicObjectUrl(s3, pathname);
  }

  const proxyBaseUrl = imageProxyBaseUrl();

  if (proxyBaseUrl && pathname.startsWith("pfps/")) {
    return `${proxyBaseUrl}/${pathname}`;
  }

  return pathname;
}

function imageProxyBaseUrl() {
  if (process.env.IMAGE_PROXY_DISABLED === "true") {
    return undefined;
  }

  if (process.env.IMAGE_PROXY_BASE_URL) {
    return process.env.IMAGE_PROXY_BASE_URL.replace(/\/$/, "");
  }

  if (process.env.IMAGE_PROXY_DISABLED !== "false") {
    return undefined;
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

function isGalleryIndex(value: GalleryIndex | undefined): value is GalleryIndex {
  return value?.version === 1 && Array.isArray(value.entries);
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
