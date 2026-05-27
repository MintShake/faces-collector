import { spawn } from "node:child_process";

const children = new Set();
let shuttingDown = false;

const collectorUrl = process.env.COLLECTOR_URL ?? `http://127.0.0.1:${process.env.PORT ?? 3000}`;
process.env.COLLECTOR_URL = collectorUrl;
process.env.CLOUD_STORAGE_ONLY ??= "true";
process.env.KAFKA_ENABLED ??= "false";
process.env.BLOB_UPLOAD_ORIGINALS ??= "false";

start("collector-api", ["dist/server.js"]);
setTimeout(() => {
  start("hub-monitor", ["dist/monitor-hub.js"]);
}, 1500);

function start(name, args) {
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
      shutdown(code ?? 1);
    }
  });
}

function shutdown(code = 0) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  for (const child of children) {
    child.kill("SIGTERM");
  }

  setTimeout(() => process.exit(code), 3000).unref();
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
