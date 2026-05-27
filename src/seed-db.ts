import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { config } from "./config.js";
import { updateStoredPfp } from "./db.js";

type LatestJson = {
  fid: number;
  url: string;
  sha256: string;
  path: string;
  storedAt: string;
  sourceReceivedAt?: string;
};

let seeded = 0;

for (const fidDirName of await readdir(config.pfpStorageDir).catch(() => [])) {
  const latestPath = path.join(config.pfpStorageDir, fidDirName, "latest.json");

  try {
    const latest = JSON.parse(await readFile(latestPath, "utf8")) as LatestJson;

    if (!latest.fid || !latest.url || !latest.sha256 || !latest.path) {
      continue;
    }

    updateStoredPfp({
      fid: latest.fid,
      pfpUrl: latest.url,
      pfpSha256: latest.sha256,
      pfpPath: latest.path,
      seenAt: latest.sourceReceivedAt ?? latest.storedAt,
      updatedAt: latest.storedAt
    });
    seeded += 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.warn(`Skipping ${latestPath}: ${message}`);
  }
}

console.log(`Seeded ${seeded} PFP record(s) into ${config.sqliteDbPath}`);
