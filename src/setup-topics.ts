import { config } from "./config.js";
import { kafka } from "./kafka.js";

const topicConfigResourceType = 2;
const admin = kafka.admin();

await admin.connect();

try {
  await admin.createTopics({
    waitForLeaders: true,
    topics: [
      {
        topic: config.interactionsTopic,
        numPartitions: 6,
        replicationFactor: 1
      },
      {
        topic: config.uniqueFidsTopic,
        numPartitions: 6,
        replicationFactor: 1,
        configEntries: [
          { name: "cleanup.policy", value: "compact" },
          { name: "min.cleanable.dirty.ratio", value: "0.01" }
        ]
      },
      {
        topic: config.pfpHistoryTopic,
        numPartitions: 6,
        replicationFactor: 1
      },
      {
        topic: config.currentPfpsTopic,
        numPartitions: 6,
        replicationFactor: 1,
        configEntries: [
          { name: "cleanup.policy", value: "compact" },
          { name: "min.cleanable.dirty.ratio", value: "0.01" }
        ]
      }
    ]
  });

  await admin.alterConfigs({
    validateOnly: false,
    resources: [
      {
        type: topicConfigResourceType,
        name: config.uniqueFidsTopic,
        configEntries: [
          { name: "cleanup.policy", value: "compact" },
          { name: "min.cleanable.dirty.ratio", value: "0.01" }
        ]
      },
      {
        type: topicConfigResourceType,
        name: config.currentPfpsTopic,
        configEntries: [
          { name: "cleanup.policy", value: "compact" },
          { name: "min.cleanable.dirty.ratio", value: "0.01" }
        ]
      }
    ]
  });

  console.log("Kafka topics are ready");
} finally {
  await admin.disconnect();
}
