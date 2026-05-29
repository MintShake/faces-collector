import { getJsonFromBlob, putJsonToBlob, type BlobPfpUploadSet } from "./blob-storage.js";

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
};

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
