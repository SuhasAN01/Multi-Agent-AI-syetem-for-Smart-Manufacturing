import { NextResponse } from "next/server";
import { enqueueAlertJob } from "@/infrastructure/queue/producer.js";
import { processAlertJob } from "@/infrastructure/queue/workerUtils.js";

export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const body = await request.json();
    console.log("[Alerts API] Received:", JSON.stringify(body));
    const alertData = body.alert ? body.alert : body;
    const threadId = Date.now().toString();

    let jobId;
    try {
      jobId = await enqueueAlertJob(alertData, threadId);
      console.log("[Queue] Running with BullMQ");
      console.log("[Producer] Enqueued job:", jobId, alertData);
      return NextResponse.json({ jobId, status: "PENDING" }, { status: 202 });
      } catch (enqueueError) {
        if (process.env.NODE_ENV === "development") {
          console.warn("[Fallback] Running without Redis due to queue failure:", enqueueError.message);
          jobId = "dev-fallback-" + Date.now();
          
          try {
            // Fire inline synchronously to strictly ensure MongoDB holds exact result for UI
            console.log("[API] Calling processAlertJob");
            await processAlertJob(alertData, jobId, threadId);
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
