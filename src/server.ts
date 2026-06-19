import express from "express";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { config } from "./config.js";
import { disconnectProducer, getProducer } from "./kafka.js";
import { normalizeInteraction } from "./fid.js";
import { storePfpIfChanged, type PfpChange } from "./pfp-history.js";

const app = express();
const publicDir = path.join(process.cwd(), "public");
let monitorStatus: Record<string, unknown> | undefined;
const requestCounts = new Map<string, { count: number; resetAt: number }>();

if (!config.collectorSharedSecret) {
  console.warn("COLLECTOR_SHARED_SECRET is not set; collector write endpoints are unauthenticated.");
}

app.use(express.json({ limit: "1mb" }));
app.use("/pfps", express.static(config.pfpStorageDir));
app.use(express.static(publicDir));

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    monitor: monitorStatus
  });
});

app.post("/internal/monitor-status", requireCollectorSecret, collectorRateLimit, (req, res) => {
  monitorStatus = {
    ...req.body,
    lastHeartbeatAt: new Date().toISOString()
  };
  res.status(204).end();
});

app.get("/.well-known/appspecific/com.chrome.devtools.json", (_req, res) => {
  res.status(204).end();
});

app.get("/api/pfps", async (_req, res, next) => {
  try {
    res.json(await loadPfpGallery());
  } catch (error) {
    next(error);
  }
});

app.post("/farcaster/interactions", requireCollectorSecret, collectorRateLimit, async (req, res, next) => {
  try {
    const interaction = normalizeInteraction(req.body);
    const key = String(interaction.fid);
    const { pfpChange, pfpError } = await collectPfpChange(interaction);

    if (config.kafkaEnabled) {
      const producer = await getProducer();

      await producer.sendBatch({
        topicMessages: interactionTopicMessages(key, interaction, pfpChange)
      });
    }

    res.status(202).json({
      ok: true,
      fid: interaction.fid,
      kafkaEnabled: config.kafkaEnabled,
      pfpChanged: Boolean(pfpChange),
      pfpPath: pfpChange?.path,
      pfpBlob: pfpChange?.blob,
      pfpError
    });
  } catch (error) {
    next(error);
  }
});

app.post("/farcaster/profiles", requireCollectorSecret, collectorRateLimit, async (req, res, next) => {
  try {
    const interaction = normalizeInteraction({
      type: "profile.seen",
      source: "profile",
      ...req.body
    });
    const key = String(interaction.fid);
    const { pfpChange, pfpError } = await collectPfpChange(interaction);

    if (config.kafkaEnabled) {
      const producer = await getProducer();

      await producer.sendBatch({
        topicMessages: profileTopicMessages(key, interaction, pfpChange)
      });
    }

    res.status(202).json({
      ok: true,
      fid: interaction.fid,
      kafkaEnabled: config.kafkaEnabled,
      pfpChanged: Boolean(pfpChange),
      pfpPath: pfpChange?.path,
      pfpBlob: pfpChange?.blob,
      pfpError
    });
  } catch (error) {
    next(error);
  }
});

function requireCollectorSecret(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  if (!config.collectorSharedSecret) {
    next();
    return;
  }

  const auth = req.get("authorization");
  const token = req.get("x-collector-secret") ?? auth?.replace(/^Bearer\s+/i, "");

  if (token !== config.collectorSharedSecret) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return;
  }

  next();
}

function collectorRateLimit(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  const now = Date.now();
  const windowMs = Math.max(1_000, config.collectorRateLimitWindowMs);
  const max = Math.max(1, config.collectorRateLimitMax);
  const key = `${req.ip}:${req.path}`;
  const current = requestCounts.get(key);
  const bucket = current && current.resetAt > now
    ? current
    : { count: 0, resetAt: now + windowMs };

  bucket.count += 1;
  requestCounts.set(key, bucket);

  if (bucket.count > max) {
    res.setHeader("Retry-After", Math.ceil((bucket.resetAt - now) / 1000));
    res.status(429).json({ ok: false, error: "rate_limited" });
    return;
  }

  if (requestCounts.size > 10_000) {
    for (const [entryKey, entry] of requestCounts) {
      if (entry.resetAt <= now) {
        requestCounts.delete(entryKey);
      }
    }
  }

  next();
}

async function collectPfpChange(interaction: ReturnType<typeof normalizeInteraction>) {
  try {
    return {
      pfpChange: await storePfpIfChanged(interaction),
      pfpError: undefined
    };
  } catch (error) {
    const pfpError = error instanceof Error ? error.message : "Unknown PFP collection error";
    console.warn(`Skipping PFP for fid ${interaction.fid}: ${pfpError}`);

    return {
      pfpChange: undefined,
      pfpError
    };
  }
}

function interactionTopicMessages(
  key: string,
  interaction: ReturnType<typeof normalizeInteraction>,
  pfpChange?: PfpChange
) {
  return [
    {
      topic: config.interactionsTopic,
      messages: [
        {
          key,
          value: JSON.stringify(interaction)
        }
      ]
    },
    ...profileTopicMessages(key, interaction, pfpChange)
  ];
}

function profileTopicMessages(
  key: string,
  interaction: ReturnType<typeof normalizeInteraction>,
  pfpChange?: PfpChange
) {
  return [
    {
      topic: config.uniqueFidsTopic,
      messages: [
        {
          key,
          value: JSON.stringify({
            fid: interaction.fid,
            lastSeenAt: interaction.receivedAt,
            lastEventType: interaction.eventType,
            pfpUrl: interaction.pfpUrl,
            username: interaction.username,
            displayName: interaction.displayName,
            bio: interaction.bio,
            profileUrl: interaction.profileUrl
          })
        }
      ]
    },
    ...(pfpChange
      ? [
          {
            topic: config.pfpHistoryTopic,
            messages: [
              {
                key,
                value: JSON.stringify(pfpChange)
              }
            ]
          },
          {
            topic: config.currentPfpsTopic,
            messages: [
              {
                key,
                value: JSON.stringify(pfpChange)
              }
            ]
          }
        ]
      : [])
  ];
}

async function loadPfpGallery() {
  const fidDirs = await readdir(config.pfpStorageDir, { withFileTypes: true }).catch(() => []);
  const fids = await Promise.all(
    fidDirs
      .filter((entry) => entry.isDirectory() && /^\d+$/.test(entry.name))
      .map(async (entry) => loadFidPfps(entry.name))
  );
  const visibleFids = fids
    .filter((fid): fid is NonNullable<typeof fid> => Boolean(fid))
    .sort((a, b) => {
      const newestA = Date.parse(a.latest?.storedAt ?? "0");
      const newestB = Date.parse(b.latest?.storedAt ?? "0");
      return newestB - newestA;
    });

  return {
    totalFids: visibleFids.length,
    totalImages: visibleFids.reduce((sum, fid) => sum + fid.images.length, 0),
    fids: visibleFids
  };
}

async function loadFidPfps(fid: string) {
  const fidDir = path.join(config.pfpStorageDir, fid);
  const files = await readdir(fidDir, { withFileTypes: true });
  const images = await Promise.all(
    files
      .filter((entry) => entry.isFile() && /\.(avif|gif|jpe?g|png|webp)$/i.test(entry.name))
      .map(async (entry) => {
        const imagePath = path.join(fidDir, entry.name);
        const imageStat = await stat(imagePath);

        return {
          filename: entry.name,
          url: `/pfps/${fid}/${encodeURIComponent(entry.name)}`,
          size: imageStat.size,
          storedAt: storedAtFromFilename(entry.name) ?? imageStat.mtime.toISOString()
        };
      })
  );

  if (images.length === 0) {
    return undefined;
  }

  images.sort((a, b) => Date.parse(b.storedAt) - Date.parse(a.storedAt));

  return {
    fid: Number(fid),
    latest: await loadLatestJson(fidDir),
    images
  };
}

async function loadLatestJson(fidDir: string) {
  try {
    const latest = JSON.parse(await readdirAndReadLatest(fidDir)) as {
      url?: string;
      sha256?: string;
      storedAt?: string;
      sourceEventType?: string;
    };

    return latest;
  } catch {
    return undefined;
  }
}

async function readdirAndReadLatest(fidDir: string) {
  const { readFile } = await import("node:fs/promises");
  return readFile(path.join(fidDir, "latest.json"), "utf8");
}

function storedAtFromFilename(filename: string) {
  const match = filename.match(/^(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)-/);

  if (!match) {
    return undefined;
  }

  return match[1].replace(
    /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/,
    "$1T$2:$3:$4.$5Z"
  );
}

app.use(
  (
    error: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = message.includes("fid") ? 400 : 500;
    res.status(status).json({ ok: false, error: message });
  }
);

const server = app.listen(config.port, () => {
  console.log(`Farcaster FID logger listening on http://localhost:${config.port}`);
});

async function shutdown(signal: string) {
  console.log(`Received ${signal}, shutting down`);
  server.close(async () => {
    await disconnectProducer();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
