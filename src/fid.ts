export type FarcasterInteraction = {
  fid: number;
  eventType: string;
  source: string;
  receivedAt: string;
  pfpUrl?: string;
  payload: unknown;
};

type JsonObject = Record<string, unknown>;

export function normalizeInteraction(payload: unknown): FarcasterInteraction {
  const fid = extractFid(payload);

  if (!fid) {
    throw new Error("No Farcaster fid found in payload");
  }

  return {
    fid,
    eventType: extractString(payload, ["type", "event", "eventType"]) ?? "interaction",
    source: extractString(payload, ["source", "provider"]) ?? "farcaster",
    receivedAt: new Date().toISOString(),
    pfpUrl: extractPfpUrl(payload),
    payload
  };
}

function extractFid(value: unknown): number | undefined {
  const found = findFirst(value, ["fid", "caster_fid", "author_fid", "viewer_fid"]);

  if (typeof found === "number" && Number.isInteger(found) && found > 0) {
    return found;
  }

  if (typeof found === "string") {
    const parsed = Number(found);
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return undefined;
}

function extractString(value: unknown, keys: string[]) {
  const found = findFirst(value, keys);
  return typeof found === "string" && found.length > 0 ? found : undefined;
}

function extractPfpUrl(value: unknown): string | undefined {
  const found = findFirst(value, [
    "pfp_url",
    "pfpUrl",
    "avatar_url",
    "avatarUrl",
    "image_url",
    "imageUrl",
    "profile_image_url",
    "profileImageUrl",
    "avatar"
  ]);

  if (typeof found !== "string") {
    return undefined;
  }

  try {
    const url = new URL(found);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function findFirst(value: unknown, keys: string[]): unknown {
  if (!isJsonObject(value)) {
    return undefined;
  }

  const queue: JsonObject[] = [value];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }

    for (const key of keys) {
      if (key in current) {
        return current[key];
      }
    }

    for (const nested of Object.values(current)) {
      if (isJsonObject(nested)) {
        queue.push(nested);
      } else if (Array.isArray(nested)) {
        queue.push(...nested.filter(isJsonObject));
      }
    }
  }

  return undefined;
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
