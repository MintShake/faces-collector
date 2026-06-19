import "dotenv/config";

export const config = {
  port: Number(process.env.PORT ?? 3000),
  kafkaClientId: process.env.KAFKA_CLIENT_ID ?? "farcaster-fid-logger",
  kafkaBrokers: (process.env.KAFKA_BROKERS ?? "localhost:9092")
    .split(",")
    .map((broker) => broker.trim())
    .filter(Boolean),
  interactionsTopic: process.env.KAFKA_INTERACTIONS_TOPIC ?? "farcaster.interactions",
  uniqueFidsTopic: process.env.KAFKA_UNIQUE_FIDS_TOPIC ?? "farcaster.unique-fids",
  pfpHistoryTopic: process.env.KAFKA_PFP_HISTORY_TOPIC ?? "farcaster.pfp-history",
  currentPfpsTopic: process.env.KAFKA_CURRENT_PFPS_TOPIC ?? "farcaster.current-pfps",
  kafkaEnabled: process.env.KAFKA_ENABLED === "true",
  cloudStorageOnly: process.env.CLOUD_STORAGE_ONLY !== "false",
  pfpStorageDir: process.env.PFP_STORAGE_DIR ?? "data/pfps",
  sqliteDbPath: process.env.SQLITE_DB_PATH ?? "data/faces.sqlite",
  blobUploadOriginals: process.env.BLOB_UPLOAD_ORIGINALS === "true",
  collectorSharedSecret: process.env.COLLECTOR_SHARED_SECRET,
  collectorRateLimitWindowMs: Number(process.env.COLLECTOR_RATE_LIMIT_WINDOW_MS ?? 60_000),
  collectorRateLimitMax: Number(process.env.COLLECTOR_RATE_LIMIT_MAX ?? 120),
  maxPfpDownloadBytes: Number(process.env.MAX_PFP_DOWNLOAD_BYTES ?? 5_000_000),
  collectorUrl: process.env.COLLECTOR_URL ?? "http://localhost:3000",
  facesWebUrl: process.env.FACES_WEB_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://web-sigma-three-32.vercel.app",
  facesNotificationSecret: process.env.FACES_NOTIFICATION_SECRET,
  neynarApiKey: process.env.NEYNAR_API_KEY,
  neynarFeedUrl:
    process.env.NEYNAR_FEED_URL ?? "https://api.neynar.com/v2/farcaster/feed/",
  neynarFeedLimit: Number(process.env.NEYNAR_FEED_LIMIT ?? 100),
  neynarPollIntervalMs: Number(process.env.NEYNAR_POLL_INTERVAL_MS ?? 60_000),
  hubRpcEndpoint: process.env.HUB_RPC_ENDPOINT ?? "hub-grpc-api.neynar.com",
  hubProfileRefreshIntervalMs: Number(process.env.HUB_PROFILE_REFRESH_INTERVAL_MS ?? 3_600_000),
  hubMonitorStaleEventMs: Number(process.env.HUB_MONITOR_STALE_EVENT_MS ?? 600_000)
};
