import { NextResponse } from "next/server";
import getMongoClientPromise from "@/integrations/mongodb/client.js";

/**
 * XAI Audit Trace API
 * Simple endpoint for historical reasoning logs.
 */

export async function GET() {
  try {
    const dbName = process.env.DATABASE_NAME;
    const client = await getMongoClientPromise();
    const db = client.db(dbName);

    // Fetch from agent_audit_traces (synced with Worker)
    const traces = await db
      .collection("agent_audit_traces")
      .find({})
      .sort({ timestamp: -1 })
      .limit(50)
      .toArray();

    return NextResponse.json(traces);
  } catch (error) {
    console.error("[API XAI GET] Error:", error.message);
    return NextResponse.json({ error: "Failed to fetch XAI traces" }, { status: 500 });
  }
}
