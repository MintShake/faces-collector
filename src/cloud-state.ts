import { getJsonFromBlob, putJsonToBlob, type BlobPfpUploadSet } from "./blob-storage.js";
import type { NeynarBulkUser } from "./neynar.js";

export type CloudProfile = {
  fid: number;
  pfpUrl?: string;
  pfpSha256?: string;
  username?: string;
  displayName?: string;
  bio?: string;
  profileUrl?: string;
  blob?: BlobPfpUploadSet;
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

const SCORE_INDEX_PATH = "state/score-index.json";

export function computeFarcasterScore(input: {
  followerCount: number;
  neynarScore: number;
  powerBadge: boolean;
  verifications: string[];
}): number {
  const followerPts = (Math.log10(input.followerCount + 1) / 6) * 40;
  const neynarPts = input.neynarScore * 35;
  const badgePts = input.powerBadge ? 15 : 0;
  const verifPts = Math.min(input.verifications.length, 2) * 5;
  return Math.min(100, followerPts + neynarPts + badgePts + verifPts);
}

export function shouldEnrichWithNeynar(
  profile: CloudProfile | undefined,
  refreshIntervalMs = 7 * 24 * 3_600_000
): boolean {
  if (!profile?.neynarEnrichedAt) return true;
  return Date.now() - Date.parse(profile.neynarEnrichedAt) > refreshIntervalMs;
}

// Enriches a batch of FIDs with Neynar data. Returns a fid→score map for the caller
// to write into the score index if desired (backfill) or ignore (online path).
export async function enrichCloudProfilesWithNeynar(
  fids: number[],
  opts: { delayMs?: number } = {}
): Promise<Map<number, number>> {
  const { fetchNeynarUsersBulk } = await import("./neynar.js");
  const scores = new Map<number, number>();

  for (let i = 0; i < fids.length; i += 100) {
    const batch = fids.slice(i, i + 100);

    if (i > 0 && opts.delayMs) {
      await new Promise((r) => setTimeout(r, opts.delayMs));
    }

    let users: NeynarBulkUser[];
    try {
      users = await fetchNeynarUsersBulk(batch);
    } catch (err) {
      console.warn(`Neynar batch fetch failed (offset ${i}):`, err instanceof Error ? err.message : err);
      continue;
    }

    await Promise.all(
      users.map(async (user) => {
        const enrichedAt = new Date().toISOString();
        const farcasterScore = computeFarcasterScore({
          followerCount: user.follower_count,
          neynarScore: user.score,
          powerBadge: user.power_badge,
          verifications: user.verifications
        });
        const existing = await getCloudProfile(user.fid);

        await putCloudProfile({
          fid: user.fid,
          firstSeenAt: existing?.firstSeenAt ?? enrichedAt,
          lastSeenAt: existing?.lastSeenAt ?? enrichedAt,
          lastProfileFetchedAt: existing?.lastProfileFetchedAt,
          pfpUrl: user.pfp_url ?? existing?.pfpUrl,
          pfpSha256: existing?.pfpSha256,
          username: user.username ?? existing?.username,
          displayName: user.display_name ?? existing?.displayName,
          bio: user.profile?.bio?.text ?? existing?.bio,
          profileUrl: existing?.profileUrl,
          blob: existing?.blob,
          updatedAt: enrichedAt,
          followerCount: user.follower_count,
          neynarScore: user.score,
          powerBadge: user.power_badge,
          verifications: user.verifications,
          farcasterScore,
          neynarEnrichedAt: enrichedAt
        });

        scores.set(user.fid, farcasterScore);
      })
    );
  }

  return scores;
}

export async function writeScoreIndex(scores: Map<number, number>): Promise<void> {
  const obj: Record<string, number> = {};
  for (const [fid, score] of scores) {
    obj[String(fid)] = score;
  }
  await putJsonToBlob(SCORE_INDEX_PATH, obj);
}

export async function getCloudProfile(fid: number) {
  return getJsonFromBlob<CloudProfile>(profilePath(fid));
}

export async function markCloudFidSeen(fid: number, seenAt = new Date().toISOString()) {
  const existing = await getCloudProfile(fid);

  if (existing) {
    return existing;
  }

  await putCloudProfile({
    fid,
    firstSeenAt: seenAt,
    lastSeenAt: seenAt,
    updatedAt: seenAt
  });
}

export async function markCloudProfileFetched(fid: number, fetchedAt = new Date().toISOString()) {
  const existing = await getCloudProfile(fid);
  await putCloudProfile({
    fid,
    firstSeenAt: existing?.firstSeenAt ?? fetchedAt,
    lastSeenAt: fetchedAt,
    lastProfileFetchedAt: fetchedAt,
    pfpUrl: existing?.pfpUrl,
    pfpSha256: existing?.pfpSha256,
    username: existing?.username,
    displayName: existing?.displayName,
    bio: existing?.bio,
    profileUrl: existing?.profileUrl,
    blob: existing?.blob,
    followerCount: existing?.followerCount,
    neynarScore: existing?.neynarScore,
    powerBadge: existing?.powerBadge,
    verifications: existing?.verifications,
    farcasterScore: existing?.farcasterScore,
    neynarEnrichedAt: existing?.neynarEnrichedAt,
    updatedAt: fetchedAt
  });
}

export async function updateCloudProfileMetadata(input: {
  fid: number;
  username?: string;
  displayName?: string;
  bio?: string;
  profileUrl?: string;
  seenAt: string;
}) {
  const existing = await getCloudProfile(input.fid);

  await putCloudProfile({
    fid: input.fid,
    firstSeenAt: existing?.firstSeenAt ?? input.seenAt,
    lastSeenAt: input.seenAt,
    lastProfileFetchedAt: existing?.lastProfileFetchedAt,
    pfpUrl: existing?.pfpUrl,
    pfpSha256: existing?.pfpSha256,
    username: input.username ?? existing?.username,
    displayName: input.displayName ?? existing?.displayName,
    bio: input.bio ?? existing?.bio,
    profileUrl: input.profileUrl ?? existing?.profileUrl,
    blob: existing?.blob,
    followerCount: existing?.followerCount,
    neynarScore: existing?.neynarScore,
    powerBadge: existing?.powerBadge,
    verifications: existing?.verifications,
    farcasterScore: existing?.farcasterScore,
    neynarEnrichedAt: existing?.neynarEnrichedAt,
    updatedAt: new Date().toISOString()
  });
}

export async function updateCloudPfp(input: {
  fid: number;
  pfpUrl: string;
  pfpSha256: string;
  blob?: BlobPfpUploadSet;
  seenAt: string;
  updatedAt?: string;
}) {
  const existing = await getCloudProfile(input.fid);
  const updatedAt = input.updatedAt ?? new Date().toISOString();

  await putCloudProfile({
    fid: input.fid,
    firstSeenAt: existing?.firstSeenAt ?? input.seenAt,
    lastSeenAt: input.seenAt,
    lastProfileFetchedAt: updatedAt,
    pfpUrl: input.pfpUrl,
    pfpSha256: input.pfpSha256,
    username: existing?.username,
    displayName: existing?.displayName,
    bio: existing?.bio,
    profileUrl: existing?.profileUrl,
    blob: input.blob,
    followerCount: existing?.followerCount,
    neynarScore: existing?.neynarScore,
    powerBadge: existing?.powerBadge,
    verifications: existing?.verifications,
    farcasterScore: existing?.farcasterScore,
    neynarEnrichedAt: existing?.neynarEnrichedAt,
    updatedAt
  });
}

export async function shouldFetchCloudProfile(fid: number, refreshIntervalMs: number) {
  const profile = await getCloudProfile(fid);

  if (!profile?.pfpUrl || !profile.lastProfileFetchedAt) {
    return true;
  }

  return Date.now() - Date.parse(profile.lastProfileFetchedAt) > refreshIntervalMs;
}

async function putCloudProfile(profile: CloudProfile) {
  await putJsonToBlob(profilePath(profile.fid), profile);
}

function profilePath(fid: number) {
  return `state/fids/${fid}.json`;
}
