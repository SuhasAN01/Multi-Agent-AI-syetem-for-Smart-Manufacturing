import { Queue } from "bullmq";
import { env } from "../../config/env.js";
import getMongoClientPromise from "../../integrations/mongodb/client.js";

// Standard local Redis connection for Phase 1.
// In Phase 2, this is replaced by SQS.
export const connection = {
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: parseInt(process.env.REDIS_PORT || "6379", 10),
  maxRetriesPerRequest: null,
  retryStrategy(times) {
    if (process.env.NODE_ENV === "development" && (!process.env.REDIS_HOST || process.env.REDIS_HOST === "127.0.0.1")) {
      return null; // Stop retrying immediately to trigger local fallback
    }
    return Math.min(times * 50, 2000);
  }
};

let agentQueue = null;

function getAgentQueue() {
  if (!agentQueue) {
    agentQueue = new Queue("agent-workflow-queue", { connection });
  }
  return agentQueue;
}

/**
 * Pushes a new alert processing job into the background queue.
 * This should be called directly by Next.js API route (/api/chat).
 * Next.js returns 202 Accepted immediately so the frontend isn't blocked.
 * 
 * @param {Object} alertPayload The raw alert from the UI
 * @param {string} threadId The conversation thread ID
 */
export async function enqueueAlertJob(alertPayload, threadId) {
  const queue = getAgentQueue();
  const job = await queue.add(
    "process-alert",
    { alert: alertPayload, threadId },
    {
      attempts: 3,
      backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: true, // Keep Redis memory clean
      removeOnFail: false,    // Keep failed jobs for inspection
    }
  );
  
  console.log("[Producer] Enqueued job:", job.id, job.data);
  
  try {
    const client = await getMongoClientPromise();
    const dbName = process.env.DATABASE_NAME;
    await client.db(dbName).collection("job_tracking").insertOne({
      job_id: job.id,
      thread_id: threadId,
      alert_id: alertPayload._id || alertPayload.machine_id,
      status: "PENDING",
      created_at: new Date(),
      updated_at: new Date()
    });
  } catch (err) {
    console.error("[Producer] Failed to write PENDING status to MongoDB", err);
  }

  return job.id;
}
