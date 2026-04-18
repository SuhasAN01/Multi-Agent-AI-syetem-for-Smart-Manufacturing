import getMongoClientPromise from "./client.js";

/**
 * Run this module independently or inside an API boot script to safely generate indexes.
 */
export async function initializeDatabaseIndexes() {
  try {
    const client = await getMongoClientPromise();
    const dbName = process.env.DATABASE_NAME;
    if (!dbName) throw new Error("Missing DATABASE_NAME");
    const db = client.db(dbName);

    console.log("[MongoDB Init] Ensuring indexes...");

    // Speeds up agent trace retrieval
    await db.collection("agent_audit_traces").createIndex({ alert_id: 1, timestamp: -1 });
    
    // Idempotency: Ensure the same alert ID can only ever be tracked by ONE unique queue job at once
    await db.collection("job_tracking").createIndex({ alert_id: 1 }, { unique: true });
    
    // Idempotency limits for work orders linked to an alert
    await db.collection("workorders").createIndex({ alert_id: 1 }, { unique: true, sparse: true });

    console.log("[MongoDB Init] Indexes stabilized successfully!");
  } catch (error) {
    console.error("[MongoDB Init] Failed to create indexes:", error);
  }
}
