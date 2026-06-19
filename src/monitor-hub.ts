import {
  createDefaultMetadataKeyInterceptor,
  getSSLHubRpcClient,
  HubEventType,
  MessageType,
  UserDataType,
  type HubEvent,
  type HubRpcClient,
  type Message
} from "@farcaster/hub-nodejs";
import {
  markCloudFidSeen,
  markCloudProfileFetched,
  shouldFetchCloudProfile
} from "./cloud-state.js";
import { config } from "./config.js";

type ProfileSnapshot = {
  type: string;
  source: string;
  fid: number;
  pfp_url?: string;
  username?: string;
  display_name?: string;
  bio?: string;
  url?: string;
  last_hub_event_id?: number;
  last_hub_event_type?: string;
  last_message_type?: string;
};

if (!config.neynarApiKey) {
  console.error("NEYNAR_API_KEY is required for npm run monitor:hub");
  process.exit(1);
}

const neynarApiKey = config.neynarApiKey;
let stopped = false;
let client: HubRpcClient | undefined;
let seenEvents = 0;
let postedProfiles = 0;
let reconnects = 0;
const startedAt = new Date().toISOString();
let connectedAt: string | undefined;
let lastEventAt: string | undefined;
let lastProfilePostAt: string | undefined;
let lastError: string | undefined;
let staleRestartRequested = false;

process.on("SIGINT", stop);
process.on("SIGTERM", stop);
setInterval(() => {
  void postHeartbeat();
}, 30_000).unref();
setInterval(() => {
  void restartStaleStream();
}, 60_000).unref();

while (!stopped) {
  await runSubscription();

  if (!stopped) {
    reconnects += 1;
    const delayMs = reconnectDelayMs(reconnects);
    await postHeartbeat("reconnecting");
    console.warn(`Hub stream ended; reconnecting in ${delayMs}ms`);
    await sleep(delayMs);
  }
}

client?.close();

async function runSubscription() {
  client = createClient();

  try {
    await waitForReady(client);
    connectedAt = new Date().toISOString();
    lastError = undefined;
    staleRestartRequested = false;
    await postHeartbeat(reconnects > 0 ? "reconnected" : "connected");
    console.log(`Connected to Farcaster Hub stream at ${config.hubRpcEndpoint}`);

    const subscribeResult = await client.subscribe({
      eventTypes: [HubEventType.MERGE_MESSAGE]
    });

    if (subscribeResult.isErr()) {
      lastError = `Failed to subscribe to Hub events: ${subscribeResult.error.message}`;
      await postHeartbeat("subscribe_failed");
      console.error(lastError);
      return;
    }

    for await (const event of subscribeResult.value) {
      if (stopped) {
        break;
      }

      staleRestartRequested = false;
      reconnects = 0;
      await handleEvent(event);
    }
  } catch (error) {
    lastError = errorMessage(error);
    await postHeartbeat("stream_error");
    console.error(`Hub monitor stream error: ${lastError}`);
  } finally {
    client.close();
    client = undefined;
  }
}

function createClient() {
  return getSSLHubRpcClient(config.hubRpcEndpoint, {
    interceptors: [
      createDefaultMetadataKeyInterceptor("x-api-key", neynarApiKey)
    ],
    "grpc.max_receive_message_length": 20 * 1024 * 1024
  });
}

async function handleEvent(event: HubEvent) {
  seenEvents += 1;
  lastEventAt = new Date().toISOString();

  if (seenEvents % 25 === 0) {
    await postHeartbeat();
  }

  const message = event.mergeMessageBody?.message;
  const fid = message?.data?.fid;

  if (!message || !fid) {
    return;
  }

  await markSeen(fid);
  const directProfile = await profileFromUserDataMessage(message, event);

  if (directProfile) {
    await postProfile(directProfile);
    return;
  }

  if (!(await shouldRefreshProfile(fid))) {
    return;
  }

  const profile = await fetchProfileByFid(fid, event, message);
  await postProfile(profile);
}

async function profileFromUserDataMessage(
  message: Message,
  event: HubEvent
): Promise<ProfileSnapshot | undefined> {
  const body = message.data?.userDataBody;
  const fid = message.data?.fid;

  if (!body || !fid) {
    return undefined;
  }

  const profile = baseProfile(fid, event, message);

  applyUserData(profile, body.type, body.value);
  await markFetched(fid);

  return profile;
}

async function fetchProfileByFid(
  fid: number,
  event: HubEvent,
  message: Message
): Promise<ProfileSnapshot> {
  await markFetched(fid);

  if (!client) {
    return baseProfile(fid, event, message);
  }

  const result = await client.getUserDataByFid({ fid });
  const profile = baseProfile(fid, event, message);

  if (result.isErr()) {
    console.warn(`Could not fetch profile for fid ${fid}: ${result.error.message}`);
    return profile;
  }

  for (const userDataMessage of result.value.messages) {
    const body = userDataMessage.data?.userDataBody;

    if (body) {
      applyUserData(profile, body.type, body.value);
    }
  }

  return profile;
}

function baseProfile(fid: number, event: HubEvent, message: Message): ProfileSnapshot {
  return {
    type: "profile.seen",
    source: "hub.merge_message",
    fid,
    last_hub_event_id: event.id,
    last_hub_event_type: hubEventTypeName(event.type),
    last_message_type: messageTypeName(message.data?.type)
  };
}

function applyUserData(profile: ProfileSnapshot, type: UserDataType, value: string) {
  if (type === UserDataType.PFP) {
    profile.pfp_url = value;
  } else if (type === UserDataType.USERNAME) {
    profile.username = value;
  } else if (type === UserDataType.DISPLAY) {
    profile.display_name = value;
  } else if (type === UserDataType.BIO) {
    profile.bio = value;
  } else if (type === UserDataType.URL) {
    profile.url = value;
  }
}

async function markSeen(fid: number) {
  try {
    if (config.cloudStorageOnly) {
      await markCloudFidSeen(fid);
      return;
    }

    const { markFidSeen } = await import("./db.js");
    markFidSeen(fid);
  } catch (error) {
    console.warn(`Could not mark fid ${fid} seen: ${errorMessage(error)}`);
  }
}

async function markFetched(fid: number) {
  try {
    if (config.cloudStorageOnly) {
      await markCloudProfileFetched(fid);
      return;
    }

    const { markProfileFetched } = await import("./db.js");
    markProfileFetched(fid);
  } catch (error) {
    console.warn(`Could not mark fid ${fid} fetched: ${errorMessage(error)}`);
  }
}

async function shouldRefreshProfile(fid: number) {
  try {
    if (config.cloudStorageOnly) {
      return shouldFetchCloudProfile(fid, config.hubProfileRefreshIntervalMs);
    }

    const { shouldFetchProfile } = await import("./db.js");
    return shouldFetchProfile(fid, config.hubProfileRefreshIntervalMs);
  } catch (error) {
    console.warn(`Could not check refresh state for fid ${fid}: ${errorMessage(error)}`);
    return true;
  }
}

async function postProfile(profile: ProfileSnapshot) {
  const response = await fetch(new URL("/farcaster/profiles", config.collectorUrl), {
    method: "POST",
    headers: collectorHeaders(),
    body: JSON.stringify(profile),
    signal: AbortSignal.timeout(20_000)
  });

  if (!response.ok) {
    lastError = `Collector rejected fid ${profile.fid}: ${response.status} ${await response.text()}`;
    await postHeartbeat("collector_rejected");
    console.warn(lastError);
    return;
  }

  postedProfiles += 1;
  lastProfilePostAt = new Date().toISOString();

  if (postedProfiles % 25 === 0) {
    await postHeartbeat();
    console.log(`Hub monitor processed ${seenEvents} event(s), posted ${postedProfiles} profile snapshot(s)`);
  }
}

async function postHeartbeat(status = "running") {
  try {
    await fetch(new URL("/internal/monitor-status", config.collectorUrl), {
      method: "POST",
      headers: collectorHeaders(),
      body: JSON.stringify({
        status,
        startedAt,
        connectedAt,
        seenEvents,
        postedProfiles,
        reconnects,
        lastEventAt,
        lastProfilePostAt,
        lastError
      }),
      signal: AbortSignal.timeout(10_000)
    });
  } catch (error) {
    console.warn(`Could not post monitor heartbeat: ${errorMessage(error)}`);
  }
}

async function restartStaleStream() {
  if (stopped || !client || !connectedAt) {
    return;
  }

  const now = Date.now();
  const latestActivityAt = lastEventAt ?? connectedAt;
  const idleMs = now - Date.parse(latestActivityAt);

  if (!Number.isFinite(idleMs) || idleMs < config.hubMonitorStaleEventMs) {
    return;
  }

  if (staleRestartRequested) {
    return;
  }

  staleRestartRequested = true;
  lastError = `No Hub events for ${Math.round(idleMs / 1000)}s; restarting subscription`;
  console.warn(lastError);
  await postHeartbeat("stale_stream_restart");
  client.close();
}

function collectorHeaders() {
  return {
    "content-type": "application/json",
    ...(config.collectorSharedSecret ? { "x-collector-secret": config.collectorSharedSecret } : {})
  };
}

function waitForReady(hubClient: HubRpcClient) {
  return new Promise<void>((resolve, reject) => {
    hubClient.$.waitForReady(Date.now() + 10_000, (error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

function stop(signal: string) {
  console.log(`Received ${signal}, stopping Hub monitor`);
  void postHeartbeat("stopping");
  stopped = true;
  client?.close();
}

function reconnectDelayMs(attempt: number) {
  return Math.min(60_000, 5_000 * Math.max(1, attempt));
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hubEventTypeName(type?: HubEventType) {
  return type === undefined ? undefined : HubEventType[type];
}

function messageTypeName(type?: MessageType) {
  return type === undefined ? undefined : MessageType[type];
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}
