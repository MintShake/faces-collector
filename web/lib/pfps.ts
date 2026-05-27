import { list } from "@vercel/blob";

export type PfpImage = {
  filename: string;
  url: string;
  thumbUrl?: string;
  mediumUrl?: string;
  size: number;
  storedAt: string;
};

export type FidTile = {
  fid: number;
  images: PfpImage[];
  latest?: {
    url?: string;
    sha256?: string;
    storedAt?: string;
    sourceEventType?: string;
  };
};

export async function getPfpGallery() {
  return getBlobPfpGallery();
}

export async function getFidTile(fid: number): Promise<FidTile | undefined> {
  const gallery = await getBlobPfpGallery();
  return gallery.find((tile) => tile.fid === fid);
}

async function getBlobPfpGallery() {
  const blobs = await listAllBlobs("pfps/");
  const byFid = new Map<number, Map<string, Partial<PfpImage> & { filename: string; storedAt: string; size: number }>>();

  for (const blob of blobs) {
    const match = blob.pathname.match(/^pfps\/(\d+)\/(.+)\.(thumb|medium)\.webp$/i);

    if (!match) {
      continue;
    }

    const fid = Number(match[1]);
    const basename = match[2];
    const variant = match[3].toLowerCase() as "thumb" | "medium";
    const images = byFid.get(fid) ?? new Map();
    const image = images.get(basename) ?? {
      filename: `${basename}.medium.webp`,
      url: blob.url,
      size: 0,
      storedAt: storedAtFromFilename(basename) ?? blob.uploadedAt.toISOString()
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

  return [...byFid.entries()]
    .map(([fid, imageMap]) => {
      const images = [...imageMap.values()]
        .filter((image): image is PfpImage => Boolean(image.url))
        .map((image) => ({
          ...image,
          thumbUrl: image.thumbUrl ?? image.url,
          mediumUrl: image.mediumUrl ?? image.url
        }));

      images.sort((a, b) => Date.parse(b.storedAt) - Date.parse(a.storedAt));
      return { fid, images };
    })
    .filter((tile) => tile.images.length > 0)
    .sort((a, b) => {
      const countDelta = b.images.length - a.images.length;

      if (countDelta !== 0) {
        return countDelta;
      }

      return newestTime(b) - newestTime(a);
    });
}

async function listAllBlobs(prefix: string) {
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

function newestTime(tile: FidTile) {
  return Date.parse(tile.images[0]?.storedAt ?? "0");
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
