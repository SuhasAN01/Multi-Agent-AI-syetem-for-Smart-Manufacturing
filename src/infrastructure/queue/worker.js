import { Worker } from "bullmq";
import { connection } from "./producer.js";
import { processAlertJob } from "./workerUtils.js";
import getMongoClientPromise from "../../integrations/mongodb/client.js";

async function updateJobStatus(jobId, status, errorText = null) {
  try {
    const client = await getMongoClientPromise();
    const dbName = process.env.DATABASE_NAME;
    const updatePayload = { status, updated_at: new Date() };
    if (errorText) updatePayload.error = errorText;

    await client.db(dbName).collection("job_tracking").updateOne(
      { job_id: jobId },
      { $set: updatePayload }
    );
  } catch (err) {
    console.error(`[Worker] Failed to update job status in MongoDB for ${jobId}`, err);
  }
}

/**
 * Phase 1 Worker: Consumes BullMQ jobs asynchronously.
 * This runs in a background Node process, completely detached from Next.js serverless timeouts!
 */
export const worker = new Worker(
  "agent-workflow-queue",
  async (job) => {
    const alertData = job.data.alert;
    const threadId = job.data.threadId || Date.now().toString();
    console.log("[Worker] Received job:", job.data);
    
    try {
      await processAlertJob(job.data.alert, job.id, threadId);
      return { status: "success" };
    } catch (error) {
      console.error(`[Worker] Failed Job ${job.id}:`, error);
      await updateJobStatus(job.id, "FAILED", error.message);
      throw error; 
    }
  },
  { 
    connection,
    concurrency: 5 // Process 5 agents simultaneously
  }
);
