import { NextResponse } from "next/server";
import { enqueueAlertJob } from "@/infrastructure/queue/producer.js";
import { processAlertJob } from "@/infrastructure/queue/workerUtils.js";

export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const demoAlert = {
      machine_id: "demo-001",
      temperature: 95,
      vibration: 0.9,
      timestamp: new Date().toISOString(),
      anomaly: true,
      description: "Simulated overheating and vibration spike"
    };

    const threadId = "demo-" + Date.now().toString();
    
    let jobId;
    try {
      jobId = await enqueueAlertJob(demoAlert, threadId);
      console.log("[Demo] Created demo alert and enqueued job:", jobId);
      return NextResponse.json({ jobId, status: "PENDING" }, { status: 202 });
    } catch (enqueueError) {
      if (process.env.NODE_ENV === "development") {
        console.warn("[Fallback] Running without Redis due to queue failure config:", enqueueError.message);
        jobId = "dev-demo-fallback-" + Date.now();
        
        try {
          await processAlertJob(demoAlert, jobId, threadId);
          return NextResponse.json({ jobId, status: "COMPLETED", fallback: true }, { status: 200 });
        } catch (jobError) {
          console.error("[Critical Error]", jobError);
          return NextResponse.json({ jobId, status: "FAILED", error: jobError.message, fallback: true }, { status: 200 });
        }
      } else {
        throw enqueueError;
      }
    }
  } catch (error) {
    console.error("[Alerts API Error]:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

