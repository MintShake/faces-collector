import { spawn } from "node:child_process";

const children = new Set();
const restartTimers = new Map();
let shuttingDown = false;

const collectorUrl = process.env.COLLECTOR_URL ?? `http://127.0.0.1:${process.env.PORT ?? 3000}`;
process.env.COLLECTOR_URL = collectorUrl;
process.env.CLOUD_STORAGE_ONLY ??= "true";
process.env.KAFKA_ENABLED ??= "false";
process.env.BLOB_UPLOAD_ORIGINALS ??= "false";

start("collector-api", ["dist/server.js"], { critical: true });
setTimeout(() => {
  start("hub-monitor", ["dist/monitor-hub.js"], { restart: true });
}, 1500);

function start(name, args, options = {}) {
  const child = spawn(process.execPath, args, {
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"]
  });

  children.add(child);

  child.stdout.on("data", (chunk) => {
    process.stdout.write(`[${name}] ${chunk}`);
  });

  child.stderr.on("data", (chunk) => {
    process.stderr.write(`[${name}] ${chunk}`);
  });

  child.on("exit", (code, signal) => {
    children.delete(child);

    if (!shuttingDown) {
      console.error(`${name} exited with code ${code ?? "none"} signal ${signal ?? "none"}`);

      if (options.restart) {
        scheduleRestart(name, args, options);
        return;
      }

      if (options.critical) {
        shutdown(code ?? 1);
      }
    }
  });
}

function scheduleRestart(name, args, options) {
  if (restartTimers.has(name)) {
    return;
  }

  const delayMs = Number(process.env.HUB_MONITOR_RESTART_DELAY_MS ?? 10_000);
  console.error(`Restarting ${name} in ${delayMs}ms`);
  const timer = setTimeout(() => {
    restartTimers.delete(name);

    if (!shuttingDown) {
      start(name, args, options);
    }
  }, delayMs);

  restartTimers.set(name, timer);
}

function shutdown(code = 0) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  for (const timer of restartTimers.values()) {
    clearTimeout(timer);
  }

  for (const child of children) {
    child.kill("SIGTERM");
  }

  setTimeout(() => process.exit(code), 3000).unref();
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
