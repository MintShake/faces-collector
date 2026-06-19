import { config } from "./config.js";

type NeynarUser = {
  fid?: number;
  username?: string;
  display_name?: string;
  pfp_url?: string;
  profile?: {
    bio?: {
      text?: string;
    };
  };
};

type NeynarCast = {
  hash?: string;
  timestamp?: string;
  author?: NeynarUser;
};

type NeynarFeedResponse = {
  casts?: NeynarCast[];
  next?: {
    cursor?: string;
  };
};

if (!config.neynarApiKey) {
  console.error("NEYNAR_API_KEY is required for npm run monitor:neynar");
  process.exit(1);
}

let stopped = false;
let lastSeenCastHash: string | undefined;

process.on("SIGINT", stop);
process.on("SIGTERM", stop);

console.log("Neynar Farcaster monitor started");

while (!stopped) {
  try {
    const collected = await collectActiveProfiles();
    console.log(`Collected ${collected} active profile snapshot(s)`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown monitor error";
    console.error(`Neynar monitor failed: ${message}`);
  }

  await sleep(config.neynarPollIntervalMs);
}

function stop(signal: string) {
  console.log(`Received ${signal}, stopping Neynar monitor`);
  stopped = true;
}

async function collectActiveProfiles() {
  const response = await fetchTrendingFeed();
  const casts = response.casts ?? [];
  const profiles = uniqueAuthors(casts);
  let collected = 0;

  for (const profile of profiles) {
    const result = await postProfile(profile);

    if (result.ok) {
      collected += 1;
    } else {
      console.warn(`Collector rejected fid ${profile.fid}: ${result.status} ${result.body}`);
    }
  }

  const newestHash = casts[0]?.hash;
  if (newestHash) {
    lastSeenCastHash = newestHash;
  }

  return collected;
}

async function fetchTrendingFeed(): Promise<NeynarFeedResponse> {
  const url = new URL(config.neynarFeedUrl);
  url.searchParams.set("feed_type", "filter");
  url.searchParams.set("filter_type", "global_trending");
  url.searchParams.set("limit", String(config.neynarFeedLimit));
  url.searchParams.set("with_recasts", "true");

  const response = await fetch(url, {
    headers: {
      "x-api-key": config.neynarApiKey ?? ""
    },
    signal: AbortSignal.timeout(20_000)
  });

  if (!response.ok) {
    throw new Error(`Neynar feed failed: ${response.status} ${await response.text()}`);
  }

  return (await response.json()) as NeynarFeedResponse;
}

function uniqueAuthors(casts: NeynarCast[]) {
  const profiles = new Map<number, Record<string, unknown>>();

  for (const cast of casts) {
    if (lastSeenCastHash && cast.hash === lastSeenCastHash) {
      break;
    }

    const author = cast.author;
    if (!author?.fid) {
      continue;
    }

    profiles.set(author.fid, {
      type: "profile.seen",
      source: "neynar.global_trending",
      fid: author.fid,
      username: author.username,
      display_name: author.display_name,
      pfp_url: author.pfp_url,
      bio: author.profile?.bio?.text,
      last_cast_hash: cast.hash,
      last_cast_timestamp: cast.timestamp
    });
  }

  return [...profiles.values()];
}

async function postProfile(profile: Record<string, unknown>) {
  const response = await fetch(new URL("/farcaster/profiles", config.collectorUrl), {
    method: "POST",
    headers: collectorHeaders(),
    body: JSON.stringify(profile),
    signal: AbortSignal.timeout(20_000)
  });

  return {
    ok: response.ok,
    status: response.status,
    body: await response.text()
  };
}

function collectorHeaders() {
  return {
    "content-type": "application/json",
    ...(config.collectorSharedSecret ? { "x-collector-secret": config.collectorSharedSecret } : {})
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
