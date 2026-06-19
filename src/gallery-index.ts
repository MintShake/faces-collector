import { getJsonFromBlob, putJsonToBlob } from "./blob-storage.js";
import type { PfpChange } from "./pfp-history.js";

export const GALLERY_INDEX_PATH = "state/index/gallery.json";

export type GalleryIndexImage = {
  id: string;
  filename: string;
  pathname: string;
  thumbPathname?: string;
  mediumPathname?: string;
  size: number;
  storedAt: string;
};

export type GalleryIndexEntry = {
  fid: number;
  imageCount: number;
  newestAt: string;
  oldestAt: string;
  images: GalleryIndexImage[];
};

export type GalleryIndex = {
  version: 1;
  generatedAt: string;
  totalFids: number;
  totalImages: number;
  entries: GalleryIndexEntry[];
};

export async function updateGalleryIndexFromPfpChange(change: PfpChange): Promise<void> {
  const index = await getJsonFromBlob<GalleryIndex>(GALLERY_INDEX_PATH);

  // Do not create a partial broad index from one live event. Build it once with
  // npm run index:gallery, then the collector keeps it fresh.
  if (!isGalleryIndex(index)) {
    return;
  }

  const image = imageFromChange(change);

  if (!image) {
    return;
  }

  const entries = index.entries.filter((entry) => entry.fid !== change.fid);
  const existing = index.entries.find((entry) => entry.fid === change.fid);
  const images = dedupeImages([image, ...(existing?.images ?? [])])
    .sort((a, b) => Date.parse(b.storedAt) - Date.parse(a.storedAt));
  const updated: GalleryIndexEntry = {
    fid: change.fid,
    imageCount: images.length,
    newestAt: images[0]?.storedAt ?? change.storedAt,
    oldestAt: images.at(-1)?.storedAt ?? change.storedAt,
    images
  };

  entries.push(updated);
  entries.sort((a, b) => a.fid - b.fid);

  await putJsonToBlob(GALLERY_INDEX_PATH, {
    version: 1,
    generatedAt: new Date().toISOString(),
    totalFids: entries.length,
    totalImages: entries.reduce((sum, entry) => sum + entry.imageCount, 0),
    entries
  } satisfies GalleryIndex);
}

function imageFromChange(change: PfpChange): GalleryIndexImage | undefined {
  const medium = change.blob?.medium;
  const thumb = change.blob?.thumb;
  const pathname = medium?.pathname ?? thumb?.pathname;

  if (!pathname) {
    return undefined;
  }

  const filename = pathname.split("/").pop();

  if (!filename) {
    return undefined;
  }

  const basename = filename.replace(/\.(thumb|medium)\.webp$/i, "");

  return {
    id: `${change.fid}/${basename}`,
    filename: `${basename}.medium.webp`,
    pathname,
    thumbPathname: thumb?.pathname,
    mediumPathname: medium?.pathname,
    size: change.byteLength,
    storedAt: change.storedAt
  };
}

function dedupeImages(images: GalleryIndexImage[]) {
  const byId = new Map<string, GalleryIndexImage>();

  for (const image of images) {
    byId.set(image.id, image);
  }

  return [...byId.values()];
}

function isGalleryIndex(value: GalleryIndex | undefined): value is GalleryIndex {
  return value?.version === 1 && Array.isArray(value.entries);
}
