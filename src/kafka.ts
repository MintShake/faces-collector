import { Kafka, logLevel, type Producer } from "kafkajs";
import { config } from "./config.js";

export const kafka = new Kafka({
  clientId: config.kafkaClientId,
  brokers: config.kafkaBrokers,
  logLevel: logLevel.INFO
});

let producer: Producer | undefined;

export async function getProducer() {
  if (!producer) {
    producer = kafka.producer({ allowAutoTopicCreation: false });
    await producer.connect();
  }

  return producer;
}

export async function disconnectProducer() {
  if (producer) {
    await producer.disconnect();
    producer = undefined;
  }
}
