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
};

type GalleryOptions = {
  limit?: number;
  imagesPerFid?: number;
};

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
      updatedAt: profile.updatedAt
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

async function getBlobPfpGallery(options: GalleryOptions & { fid?: number } = {}) {
  const blobs = await listAllBlobs("pfps/");
  const likeSummary = await getLikeSummaryMap();
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
    .sort((a, b) => {
      const countDelta = b.imageCount - a.imageCount;

      if (countDelta !== 0) {
        return countDelta;
      }

      return newestTime(b) - newestTime(a);
    });

  return options.limit ? tiles.slice(0, options.limit) : tiles;
}

async function listAllBlobs(prefix: string) {
  const s3 = s3Config();

  if (s3) {
    const blobs = [];
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

  const blobs = [];
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
