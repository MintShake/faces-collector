#!/usr/bin/env tsx
/**
 * One-time (or periodic) backfill: fetches Neynar stats for every known FID
 * and writes them into each state/fids/<fid>.json + rebuilds state/score-index.json.
 *
 * Usage:
 *   npm run enrich:neynar
 *
 * Safe to re-run. Skips FIDs enriched within the last 7 days unless --force is passed.
 *   npm run enrich:neynar -- --force
 */
import "dotenv/config";
import {
  ListObjectsV2Command,
  S3Client,
  type S3ClientConfig
} from "@aws-sdk/client-s3";
import {
  enrichCloudProfilesWithNeynar,
  getCloudProfile,
  shouldEnrichWithNeynar,
  writeScoreIndex
} from "../src/cloud-state.js";

const BATCH_DELAY_MS = 250;
const REFRESH_INTERVAL_MS = 7 * 24 * 3_600_000;
const force = process.argv.includes("--force");

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
  console.error("S3/Tigris credentials not set. Check your .env file.");
  process.exit(1);
}

if (!process.env.NEYNAR_API_KEY) {
  console.error("NEYNAR_API_KEY not set.");
  process.exit(1);
}

const clientConfig: S3ClientConfig = {
  endpoint,
  region,
  credentials: { accessKeyId, secretAccessKey },
  forcePathStyle: true
};
const s3 = new S3Client(clientConfig);

async function listAllProfileFids(): Promise<number[]> {
  const fids: number[] = [];
  let continuationToken: string | undefined;

  do {
    const page = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucket!,
        Prefix: "state/fids/",
        MaxKeys: 1000,
        ContinuationToken: continuationToken
      })
    );

    for (const item of page.Contents ?? []) {
      const match = item.Key?.match(/^state\/fids\/(\d+)\.json$/);
      if (match) fids.push(Number(match[1]));
    }

    continuationToken = page.NextContinuationToken;
  } while (continuationToken);

  return fids;
}

async function main() {
  console.log("Listing FIDs from blob storage…");
  const allFids = await listAllProfileFids();
  console.log(`Found ${allFids.length} FID profiles.`);

  let fidsToEnrich = allFids;

  if (!force) {
    console.log("Checking which FIDs need enrichment (skipping recently enriched)…");
    const stale: number[] = [];

    for (let i = 0; i < allFids.length; i += 100) {
      const batch = allFids.slice(i, i + 100);
      const checks = await Promise.all(
        batch.map(async (fid) => {
          const profile = await getCloudProfile(fid);
          return shouldEnrichWithNeynar(profile, REFRESH_INTERVAL_MS) ? fid : null;
        })
      );
      stale.push(...(checks.filter(Boolean) as number[]));

      if (i % 1000 === 0 && i > 0) {
        console.log(`  Checked ${i}/${allFids.length}, ${stale.length} need enrichment so far…`);
      }
    }

    fidsToEnrich = stale;
  }

  console.log(`Enriching ${fidsToEnrich.length} FIDs via Neynar (100 per batch, ${BATCH_DELAY_MS}ms delay)…`);

  const allScores = new Map<number, number>();
  const batchCount = Math.ceil(fidsToEnrich.length / 100);

  for (let i = 0; i < fidsToEnrich.length; i += 100) {
    const batch = fidsToEnrich.slice(i, i + 100);
    const batchNum = Math.floor(i / 100) + 1;

    process.stdout.write(`  Batch ${batchNum}/${batchCount} (fids ${batch[0]}…${batch.at(-1)})… `);

    const scores = await enrichCloudProfilesWithNeynar(batch, { delayMs: 0 });

    for (const [fid, score] of scores) {
      allScores.set(fid, score);
    }

    console.log(`done (${scores.size} enriched)`);

    if (i + 100 < fidsToEnrich.length) {
      await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
    }
  }

  console.log(`Writing score index for ${allScores.size} FIDs…`);
  await writeScoreIndex(allScores);
  console.log("Done.");
}

main().catch((err) => {
  console.error("Enrichment failed:", err);
  process.exit(1);
});
