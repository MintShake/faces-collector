import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { config } from "./config.js";

export type StoredProfile = {
  fid: number;
  pfpUrl?: string;
  pfpSha256?: string;
  pfpPath?: string;
  firstSeenAt: string;
  lastSeenAt: string;
  lastProfileFetchedAt?: string;
  updatedAt: string;
  followerCount?: number;
  neynarScore?: number;
  powerBadge?: boolean;
  verifications?: string[];
  farcasterScore?: number;
  neynarEnrichedAt?: string;
};

type StoredProfileRow = {
  fid: number;
  pfp_url: string | null;
  pfp_sha256: string | null;
  pfp_path: string | null;
  first_seen_at: string;
  last_seen_at: string;
  last_profile_fetched_at: string | null;
  updated_at: string;
  follower_count: number | null;
  neynar_score: number | null;
  power_badge: number | null;
  verifications: string | null;
  farcaster_score: number | null;
  neynar_enriched_at: string | null;
};

mkdirSync(path.dirname(config.sqliteDbPath), { recursive: true });

const db = new Database(config.sqliteDbPath);
db.pragma("journal_mode = WAL");
db.pragma("busy_timeout = 5000");

db.exec(`
  CREATE TABLE IF NOT EXISTS fid_profiles (
    fid INTEGER PRIMARY KEY,
    pfp_url TEXT,
    pfp_sha256 TEXT,
    pfp_path TEXT,
    first_seen_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    last_profile_fetched_at TEXT,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_fid_profiles_pfp_sha256
    ON fid_profiles (pfp_sha256);
`);

for (const migration of [
  "ALTER TABLE fid_profiles ADD COLUMN follower_count INTEGER",
  "ALTER TABLE fid_profiles ADD COLUMN neynar_score REAL",
  "ALTER TABLE fid_profiles ADD COLUMN power_badge INTEGER",
  "ALTER TABLE fid_profiles ADD COLUMN verifications TEXT",
  "ALTER TABLE fid_profiles ADD COLUMN farcaster_score REAL",
  "ALTER TABLE fid_profiles ADD COLUMN neynar_enriched_at TEXT"
]) {
  try {
    db.exec(migration);
  } catch {
    // column already exists on subsequent startups
  }
}

const getProfileStmt = db.prepare("SELECT * FROM fid_profiles WHERE fid = ?");
const upsertSeenStmt = db.prepare(`
  INSERT INTO fid_profiles (fid, first_seen_at, last_seen_at, updated_at)
  VALUES (@fid, @now, @now, @now)
  ON CONFLICT(fid) DO UPDATE SET
    last_seen_at = excluded.last_seen_at,
    updated_at = excluded.updated_at
`);
const markProfileFetchedStmt = db.prepare(`
  INSERT INTO fid_profiles (fid, first_seen_at, last_seen_at, last_profile_fetched_at, updated_at)
  VALUES (@fid, @now, @now, @now, @now)
  ON CONFLICT(fid) DO UPDATE SET
    last_seen_at = excluded.last_seen_at,
    last_profile_fetched_at = excluded.last_profile_fetched_at,
    updated_at = excluded.updated_at
`);
const updatePfpStmt = db.prepare(`
  INSERT INTO fid_profiles (
    fid,
    pfp_url,
    pfp_sha256,
    pfp_path,
    first_seen_at,
    last_seen_at,
    last_profile_fetched_at,
    updated_at
  )
  VALUES (
    @fid,
    @pfpUrl,
    @pfpSha256,
    @pfpPath,
    @now,
    @seenAt,
    @now,
    @now
  )
  ON CONFLICT(fid) DO UPDATE SET
    pfp_url = excluded.pfp_url,
    pfp_sha256 = excluded.pfp_sha256,
    pfp_path = excluded.pfp_path,
    last_seen_at = excluded.last_seen_at,
    last_profile_fetched_at = excluded.last_profile_fetched_at,
    updated_at = excluded.updated_at
`);

export function getStoredProfile(fid: number): StoredProfile | undefined {
  const row = getProfileStmt.get(fid) as StoredProfileRow | undefined;
  return row ? mapProfile(row) : undefined;
}

export function markFidSeen(fid: number, seenAt = new Date().toISOString()) {
  upsertSeenStmt.run({ fid, now: seenAt });
}

export function markProfileFetched(fid: number, fetchedAt = new Date().toISOString()) {
  markProfileFetchedStmt.run({ fid, now: fetchedAt });
}

export function updateStoredPfp(input: {
  fid: number;
  pfpUrl: string;
  pfpSha256: string;
  pfpPath: string;
  seenAt: string;
  updatedAt?: string;
}) {
  updatePfpStmt.run({
    fid: input.fid,
    pfpUrl: input.pfpUrl,
    pfpSha256: input.pfpSha256,
    pfpPath: input.pfpPath,
    seenAt: input.seenAt,
    now: input.updatedAt ?? new Date().toISOString()
  });
}

const upsertNeynarStmt = db.prepare(`
  UPDATE fid_profiles SET
    follower_count = @followerCount,
    neynar_score = @neynarScore,
    power_badge = @powerBadge,
    verifications = @verifications,
    farcaster_score = @farcasterScore,
    neynar_enriched_at = @enrichedAt,
    updated_at = @enrichedAt
  WHERE fid = @fid
`);

export function upsertNeynarEnrichment(input: {
  fid: number;
  followerCount: number;
  neynarScore: number;
  powerBadge: boolean;
  verifications: string[];
  farcasterScore: number;
}) {
  const enrichedAt = new Date().toISOString();
  upsertNeynarStmt.run({
    fid: input.fid,
    followerCount: input.followerCount,
    neynarScore: input.neynarScore,
    powerBadge: input.powerBadge ? 1 : 0,
    verifications: JSON.stringify(input.verifications),
    farcasterScore: input.farcasterScore,
    enrichedAt
  });
}

export function shouldFetchProfile(fid: number, refreshIntervalMs: number) {
  const profile = getStoredProfile(fid);

  if (!profile) {
    return true;
  }

  if (!profile.pfpUrl) {
    return true;
  }

  if (!profile.lastProfileFetchedAt) {
    return true;
  }

  return Date.now() - Date.parse(profile.lastProfileFetchedAt) > refreshIntervalMs;
}

function mapProfile(row: StoredProfileRow): StoredProfile {
  return {
    fid: row.fid,
    pfpUrl: row.pfp_url ?? undefined,
    pfpSha256: row.pfp_sha256 ?? undefined,
    pfpPath: row.pfp_path ?? undefined,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    lastProfileFetchedAt: row.last_profile_fetched_at ?? undefined,
    updatedAt: row.updated_at,
    followerCount: row.follower_count ?? undefined,
    neynarScore: row.neynar_score ?? undefined,
    powerBadge: row.power_badge != null ? Boolean(row.power_badge) : undefined,
    verifications: row.verifications ? (JSON.parse(row.verifications) as string[]) : undefined,
    farcasterScore: row.farcaster_score ?? undefined,
    neynarEnrichedAt: row.neynar_enriched_at ?? undefined
  };
}
