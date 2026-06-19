import "dotenv/config";
import {
  ListObjectsV2Command,
  S3Client,
  type S3ClientConfig
} from "@aws-sdk/client-s3";
import { list } from "@vercel/blob";
import { GALLERY_INDEX_PATH, type GalleryIndex, type GalleryIndexImage, type GalleryIndexProfile } from "../src/gallery-index.js";
import { getJsonFromBlob, putJsonToBlob } from "../src/blob-storage.js";

type ListedObject = {
  pathname: string;
  size: number;
  uploadedAt: Date;
};

const objects = await listAllObjects("pfps/");
const byFid = new Map<number, Map<string, GalleryIndexImage>>();

for (const object of objects) {
  const match = object.pathname.match(/^pfps\/(\d+)\/(.+)\.(thumb|medium)\.webp$/i);

  if (!match) {
    continue;
  }

  const fid = Number(match[1]);
  const basename = match[2];
  const variant = match[3].toLowerCase() as "thumb" | "medium";
  const fidImages = byFid.get(fid) ?? new Map<string, GalleryIndexImage>();
  const image = fidImages.get(basename) ?? {
    id: `${fid}/${basename}`,
    filename: `${basename}.medium.webp`,
    pathname: object.pathname,
    size: 0,
    storedAt: storedAtFromFilename(basename) ?? object.uploadedAt.toISOString()
  };

  image.size += object.size;

  if (variant === "thumb") {
    image.thumbPathname = object.pathname;
  } else {
    image.pathname = object.pathname;
    image.mediumPathname = object.pathname;
  }

  fidImages.set(basename, image);
  byFid.set(fid, fidImages);
}

const profiles = await loadProfileSummaries([...byFid.keys()]);
const entries = [...byFid.entries()]
  .map(([fid, imagesByBase]) => {
    const images = [...imagesByBase.values()]
      .filter((image) => image.mediumPathname || image.thumbPathname)
      .sort((a, b) => Date.parse(b.storedAt) - Date.parse(a.storedAt));

    return {
      fid,
      imageCount: images.length,
      newestAt: images[0]?.storedAt ?? new Date(0).toISOString(),
      oldestAt: images.at(-1)?.storedAt ?? new Date(0).toISOString(),
      profile: profiles.get(fid),
      images
    };
  })
  .filter((entry) => entry.imageCount > 0)
  .sort((a, b) => a.fid - b.fid);

const index: GalleryIndex = {
  version: 1,
  generatedAt: new Date().toISOString(),
  totalFids: entries.length,
  totalImages: entries.reduce((sum, entry) => sum + entry.imageCount, 0),
  entries
};

await putJsonToBlob(GALLERY_INDEX_PATH, index);
console.log(`Wrote ${GALLERY_INDEX_PATH}: ${index.totalFids} fids, ${index.totalImages} images`);

async function loadProfileSummaries(fids: number[]) {
  const summaries = new Map<number, GalleryIndexProfile>();
  const batchSize = 25;

  for (let i = 0; i < fids.length; i += batchSize) {
    const batch = fids.slice(i, i + batchSize);

    await Promise.all(batch.map(async (fid) => {
      const profile = await getJsonFromBlob<GalleryIndexProfile & {
        profileUrl?: string;
        firstSeenAt?: string;
        lastSeenAt?: string;
        updatedAt?: string;
      }>(`state/fids/${fid}.json`).catch(() => undefined);

      if (!profile) {
        return;
      }

      summaries.set(fid, {
        fid,
        username: profile.username,
        displayName: profile.displayName,
        pfpUrl: profile.pfpUrl,
        bio: profile.bio,
        profileUrl: profile.profileUrl,
        firstSeenAt: profile.firstSeenAt,
        lastSeenAt: profile.lastSeenAt,
        updatedAt: profile.updatedAt
      });
    }));

    if (i > 0 && i % 2500 === 0) {
      console.log(`Loaded ${i.toLocaleString()} profile summaries...`);
    }
  }

  return summaries;
}

async function listAllObjects(prefix: string): Promise<ListedObject[]> {
  const s3 = s3Config();

  if (s3) {
    const objects: ListedObject[] = [];
    let continuationToken: string | undefined;

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

        objects.push({
          pathname: item.Key,
          size: item.Size ?? 0,
          uploadedAt: item.LastModified ?? new Date(0)
        });
      }

      continuationToken = page.NextContinuationToken;
    } while (continuationToken);

    return objects;
  }

  const objects: ListedObject[] = [];
  let cursor: string | undefined;

  do {
    const page = await list({
      prefix,
      limit: 1000,
      cursor
    });

    objects.push(...page.blobs.map((blob) => ({
      pathname: blob.pathname,
      size: blob.size,
      uploadedAt: blob.uploadedAt
    })));
    cursor = page.cursor;
  } while (cursor);

  return objects;
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
    credentials: {
      accessKeyId,
      secretAccessKey
    },
    forcePathStyle: true
  };

  return {
    bucket,
    client: new S3Client(clientConfig)
  };
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
