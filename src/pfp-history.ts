import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "./config.js";
import { uploadPfpToBlob, type BlobPfpUploadSet } from "./blob-storage.js";
import {
  computeFarcasterScore,
  enrichCloudProfilesWithNeynar,
  getCloudProfile,
  markCloudFidSeen,
  updateCloudPfp,
  updateCloudProfileMetadata
} from "./cloud-state.js";
import type { FarcasterInteraction } from "./fid.js";
import { createPfpVariants } from "./image-variants.js";

export type PfpChange = {
  fid: number;
  url: string;
  sha256: string;
  contentType: string;
  byteLength: number;
  storedAt: string;
  path?: string;
  blob?: BlobPfpUploadSet;
  previousSha256?: string;
  sourceEventType: string;
  sourceReceivedAt: string;
};

type LatestPfp = {
  sha256: string;
  url: string;
  path: string;
  storedAt: string;
};

export async function storePfpIfChanged(
  interaction: FarcasterInteraction
): Promise<PfpChange | undefined> {
  if (config.cloudStorageOnly) {
    return storeCloudPfpIfChanged(interaction);
  }

  const { getStoredProfile, markFidSeen, updateStoredPfp } = await import("./db.js");

  markFidSeen(interaction.fid, interaction.receivedAt);

  if (!interaction.pfpUrl) {
    return undefined;
  }

  const stored = getStoredProfile(interaction.fid);

  if (stored?.pfpUrl === interaction.pfpUrl && stored.pfpSha256) {
    return undefined;
  }

  const image = await downloadImage(interaction.pfpUrl);
  const sha256 = createHash("sha256").update(image.body).digest("hex");
  const fidDir = path.join(config.pfpStorageDir, String(interaction.fid));
  const latest = stored?.pfpSha256
    ? {
        sha256: stored.pfpSha256,
        url: stored.pfpUrl,
        path: stored.pfpPath,
        storedAt: stored.updatedAt
      }
    : await readLatest(fidDir);

  if (latest?.sha256 === sha256 && latest.path) {
    updateStoredPfp({
      fid: interaction.fid,
      pfpUrl: interaction.pfpUrl,
      pfpSha256: sha256,
      pfpPath: latest.path,
      seenAt: interaction.receivedAt
    });

    return undefined;
  }

  const storedAt = new Date().toISOString();
  const basename = `${storedAt.replace(/[:.]/g, "-")}-${sha256.slice(0, 16)}`;
  const filename = `${basename}${extensionFor(image.contentType, interaction.pfpUrl)}`;
  const filePath = path.join(fidDir, filename);
  const change: PfpChange = {
    fid: interaction.fid,
    url: interaction.pfpUrl,
    sha256,
    contentType: image.contentType,
    byteLength: image.body.byteLength,
    storedAt,
    path: filePath,
    previousSha256: latest?.sha256,
    sourceEventType: interaction.eventType,
    sourceReceivedAt: interaction.receivedAt
  };

  await mkdir(fidDir, { recursive: true });
  await writeFile(filePath, image.body);
  const blobUpload = await tryUploadPfpToBlob({
    fid: interaction.fid,
    basename,
    filename,
    body: image.body,
    contentType: image.contentType
  });

  if (blobUpload) {
    change.blob = blobUpload;
  }

  await writeFile(path.join(fidDir, "latest.json"), JSON.stringify(change, null, 2));
  updateStoredPfp({
    fid: interaction.fid,
    pfpUrl: interaction.pfpUrl,
    pfpSha256: sha256,
    pfpPath: filePath,
    seenAt: interaction.receivedAt,
    updatedAt: storedAt
  });

  fireLocalEnrichment(interaction.fid);

  return change;
}

async function storeCloudPfpIfChanged(
  interaction: FarcasterInteraction
): Promise<PfpChange | undefined> {
  await markCloudFidSeen(interaction.fid, interaction.receivedAt);
  await storeCloudProfileMetadata(interaction);

  if (!interaction.pfpUrl) {
    return undefined;
  }

  const stored = await getCloudProfile(interaction.fid);

  if (stored?.pfpUrl === interaction.pfpUrl && stored.pfpSha256) {
    return undefined;
  }

  const image = await downloadImage(interaction.pfpUrl);
  const sha256 = createHash("sha256").update(image.body).digest("hex");

  if (stored?.pfpSha256 === sha256) {
    await updateCloudPfp({
      fid: interaction.fid,
      pfpUrl: interaction.pfpUrl,
      pfpSha256: sha256,
      blob: stored.blob,
      seenAt: interaction.receivedAt
    });

    return undefined;
  }

  const storedAt = new Date().toISOString();
  const basename = `${storedAt.replace(/[:.]/g, "-")}-${sha256.slice(0, 16)}`;
  const blob = await uploadVariantsToBlob({
    fid: interaction.fid,
    basename,
    body: image.body
  });
  const change: PfpChange = {
    fid: interaction.fid,
    url: interaction.pfpUrl,
    sha256,
    contentType: image.contentType,
    byteLength: image.body.byteLength,
    storedAt,
    blob,
    previousSha256: stored?.pfpSha256,
    sourceEventType: interaction.eventType,
    sourceReceivedAt: interaction.receivedAt
  };

  await updateCloudPfp({
    fid: interaction.fid,
    pfpUrl: interaction.pfpUrl,
    pfpSha256: sha256,
    blob,
    seenAt: interaction.receivedAt,
    updatedAt: storedAt
  });

  fireCloudEnrichment(interaction.fid);

  return change;
}

async function storeCloudProfileMetadata(interaction: FarcasterInteraction) {
  if (!interaction.username && !interaction.displayName && !interaction.bio && !interaction.profileUrl) {
    return;
  }

  await updateCloudProfileMetadata({
    fid: interaction.fid,
    username: interaction.username,
    displayName: interaction.displayName,
    bio: interaction.bio,
    profileUrl: interaction.profileUrl,
    seenAt: interaction.receivedAt
  });
}

async function tryUploadPfpToBlob(input: {
  fid: number;
  basename: string;
  filename: string;
  body: Buffer;
  contentType: string;
}): Promise<BlobPfpUploadSet | undefined> {
  try {
    return await uploadVariantsToBlob(input);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Blob upload error";
    console.warn(`Skipping Blob upload for fid ${input.fid}: ${message}`);
    return undefined;
  }
}

async function uploadVariantsToBlob(input: {
  fid: number;
  basename: string;
  body: Buffer;
  filename?: string;
  contentType?: string;
}) {
  const variants = await createPfpVariants({
    body: input.body,
    basename: input.basename
  });
  const uploads: BlobPfpUploadSet = {};

  for (const variant of variants) {
    uploads[variant.label] = await uploadPfpToBlob({
      pathname: `pfps/${input.fid}/${variant.filename}`,
      body: variant.body,
      contentType: variant.contentType
    });
  }

  if (config.blobUploadOriginals && input.filename && input.contentType) {
    uploads.original = await uploadPfpToBlob({
      pathname: `pfps/${input.fid}/original/${input.filename}`,
      body: input.body,
      contentType: input.contentType
    });
  }

  return uploads;
}

async function downloadImage(url: string) {
  const response = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(15_000)
  });

  if (!response.ok) {
    throw new Error(`Failed to download PFP ${url}: ${response.status} ${response.statusText}`);
  }

  const contentType =
    response.headers.get("content-type")?.split(";")[0]?.trim() ?? "application/octet-stream";

  if (!contentType.startsWith("image/")) {
    throw new Error(`PFP URL did not return an image: ${contentType}`);
  }

  return {
    body: Buffer.from(await response.arrayBuffer()),
    contentType
  };
}

async function readLatest(fidDir: string): Promise<LatestPfp | undefined> {
  try {
    const raw = await readFile(path.join(fidDir, "latest.json"), "utf8");
    return JSON.parse(raw) as LatestPfp;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return undefined;
    }

    throw error;
  }
}

function fireCloudEnrichment(fid: number) {
  if (!config.neynarApiKey) return;
  enrichCloudProfilesWithNeynar([fid]).catch((err) => {
    console.warn(`Neynar enrichment failed for fid ${fid}:`, err instanceof Error ? err.message : err);
  });
}

function fireLocalEnrichment(fid: number) {
  if (!config.neynarApiKey) return;
  import("./neynar.js")
    .then(({ fetchNeynarUsersBulk }) => fetchNeynarUsersBulk([fid]))
    .then((users) => {
      const user = users[0];
      if (!user) return;
      return import("./db.js").then(({ upsertNeynarEnrichment }) => {
        upsertNeynarEnrichment({
          fid: user.fid,
          followerCount: user.follower_count,
          neynarScore: user.score,
          powerBadge: user.power_badge,
          verifications: user.verifications,
          farcasterScore: computeFarcasterScore({
            followerCount: user.follower_count,
            neynarScore: user.score,
            powerBadge: user.power_badge,
            verifications: user.verifications
          })
        });
      });
    })
    .catch((err) => {
      console.warn(`Local Neynar enrichment failed for fid ${fid}:`, err instanceof Error ? err.message : err);
    });
}

function extensionFor(contentType: string, url: string) {
  const fromType: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/avif": ".avif"
  };

  if (fromType[contentType]) {
    return fromType[contentType];
  }

  const ext = path.extname(new URL(url).pathname).toLowerCase();
  return ext || ".img";
}
