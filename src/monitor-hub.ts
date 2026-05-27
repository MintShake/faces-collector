import {
  createDefaultMetadataKeyInterceptor,
  getSSLHubRpcClient,
  HubEventType,
  MessageType,
  UserDataType,
  type HubEvent,
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

const client = getSSLHubRpcClient(config.hubRpcEndpoint, {
  interceptors: [
    createDefaultMetadataKeyInterceptor("x-api-key", config.neynarApiKey)
  ],
  "grpc.max_receive_message_length": 20 * 1024 * 1024
});

let stopped = false;
let seenEvents = 0;
let postedProfiles = 0;

process.on("SIGINT", stop);
process.on("SIGTERM", stop);

await waitForReady();
console.log(`Connected to Farcaster Hub stream at ${config.hubRpcEndpoint}`);

const subscribeResult = await client.subscribe({
  eventTypes: [HubEventType.MERGE_MESSAGE]
});

if (subscribeResult.isErr()) {
  console.error(`Failed to subscribe to Hub events: ${subscribeResult.error.message}`);
  client.close();
  process.exit(1);
}

for await (const event of subscribeResult.value) {
  if (stopped) {
    break;
  }

  await handleEvent(event);
}

client.close();

async function handleEvent(event: HubEvent) {
  seenEvents += 1;

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
  if (config.cloudStorageOnly) {
    await markCloudFidSeen(fid);
    return;
  }

  const { markFidSeen } = await import("./db.js");
  markFidSeen(fid);
}

async function markFetched(fid: number) {
  if (config.cloudStorageOnly) {
    await markCloudProfileFetched(fid);
    return;
  }

  const { markProfileFetched } = await import("./db.js");
  markProfileFetched(fid);
}

async function shouldRefreshProfile(fid: number) {
  if (config.cloudStorageOnly) {
    return shouldFetchCloudProfile(fid, config.hubProfileRefreshIntervalMs);
  }

  const { shouldFetchProfile } = await import("./db.js");
  return shouldFetchProfile(fid, config.hubProfileRefreshIntervalMs);
}

async function postProfile(profile: ProfileSnapshot) {
  const response = await fetch(new URL("/farcaster/profiles", config.collectorUrl), {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(profile),
    signal: AbortSignal.timeout(20_000)
  });

  if (!response.ok) {
    console.warn(`Collector rejected fid ${profile.fid}: ${response.status} ${await response.text()}`);
    return;
  }

  postedProfiles += 1;

  if (postedProfiles % 25 === 0) {
    console.log(`Hub monitor processed ${seenEvents} event(s), posted ${postedProfiles} profile snapshot(s)`);
  }
}

function waitForReady() {
  return new Promise<void>((resolve, reject) => {
    client.$.waitForReady(Date.now() + 10_000, (error) => {
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
  stopped = true;
}

function hubEventTypeName(type?: HubEventType) {
  return type === undefined ? undefined : HubEventType[type];
}

function messageTypeName(type?: MessageType) {
  return type === undefined ? undefined : MessageType[type];
}
