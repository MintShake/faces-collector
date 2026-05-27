import { config } from "./config.js";
import { kafka } from "./kafka.js";

const consumer = kafka.consumer({ groupId: `${config.kafkaClientId}-unique-fid-logger` });
const seen = new Set<string>();

await consumer.connect();
await consumer.subscribe({ topic: config.uniqueFidsTopic, fromBeginning: true });

await consumer.run({
  eachMessage: async ({ message }) => {
    const fid = message.key?.toString();

    if (!fid || seen.has(fid)) {
      return;
    }

    seen.add(fid);
    console.log(fid);
  }
});

async function shutdown(signal: string) {
  console.log(`Received ${signal}, shutting down`);
  await consumer.disconnect();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
