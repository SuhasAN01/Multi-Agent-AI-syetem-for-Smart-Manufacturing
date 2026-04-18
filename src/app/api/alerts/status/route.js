import { NextResponse } from "next/server";
import getMongoClientPromise from "@/integrations/mongodb/client.js";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get("jobId");
    
    if (!jobId) {
      return NextResponse.json({ error: "Missing jobId" }, { status: 400 });
    }

    const client = await getMongoClientPromise();
    const dbName = process.env.DATABASE_NAME;
    const doc = await client.db(dbName).collection("job_tracking").findOne({ job_id: jobId });

    if (!doc) {
      return NextResponse.json({ status: "UNKNOWN", message: "Job not found" });
    }

    return NextResponse.json({ 
      status: doc.status, // "PENDING", "PROCESSING", "COMPLETED", "FAILED"
      events: [],
      result: doc.result || null,
      error: doc.error || null,
      updated_at: doc.updated_at 
    });

  } catch (error) {
    console.error("[StatusAPI] DB Error:", error);
    return NextResponse.json({ error: "Failed to fetch status" }, { status: 500 });
  }
}
