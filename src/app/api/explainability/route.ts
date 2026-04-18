import { NextResponse } from "next/server";
import getMongoClientPromise from "@/integrations/mongodb/client";

type AuditTrace = {
  alert_id: string | null;
  agent_name: string;
  timestamp: string | Date;
  reasoning_text: string;
  decision: string;
  confidence_score: number;
  cross_machine_patterns_matched?: Array<{
    pattern_id: string;
    description: string;
    score: number;
  }>;
  digital_twin_context?: {
    cascade_risk_score?: number;
    affected_machines?: string[];
    [key: string]: unknown;
  };
};

export async function GET() {
  try {
    const dbName = process.env.DATABASE_NAME;
    if (!dbName) {
      throw new Error("DATABASE_NAME environment variable is required but not set");
    }

    const client = await getMongoClientPromise();
    const db = client.db(dbName);
    const tracesCollection = db.collection("agent_audit_traces");

    const grouped = await tracesCollection
      .aggregate([
        {
          $addFields: {
            normalized_alert_id: {
              $ifNull: ["$alert_id", "unknown_alert"],
            },
          },
        },
        { $sort: { timestamp: -1 } },
        {
          $group: {
            _id: "$normalized_alert_id",
            latest_timestamp: { $max: "$timestamp" },
            traces: {
              $push: {
                alert_id: "$alert_id",
                agent_name: "$agent_name",
                timestamp: "$timestamp",
                reasoning_text: "$reasoning_text",
                decision: "$decision",
                confidence_score: "$confidence_score",
                cross_machine_patterns_matched:
                  "$cross_machine_patterns_matched",
                digital_twin_context: "$digital_twin_context",
              },
            },
          },
        },
        { $sort: { latest_timestamp: -1 } },
        { $limit: 20 },
      ])
      .toArray();

    const data = grouped.map((entry) => {
      const traces = (entry.traces || [])
        .sort(
          (a: AuditTrace, b: AuditTrace) =>
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        )
        .map((trace: AuditTrace) => ({
          ...trace,
          timestamp: new Date(trace.timestamp).toISOString(),
          cross_machine_patterns_matched:
            trace.cross_machine_patterns_matched || [],
          digital_twin_context: trace.digital_twin_context || {},
        }));
      const latestTrace = traces[traces.length - 1];
      const machines = new Set<string>();
      traces.forEach((trace: AuditTrace) => {
        const affected = trace.digital_twin_context?.affected_machines || [];
        affected.forEach((machine) => machines.add(machine));
      });

      return {
        alert_id: entry._id === "unknown_alert" ? null : entry._id,
        latest_timestamp: entry.latest_timestamp
          ? new Date(entry.latest_timestamp).toISOString()
          : null,
        overall_decision: latestTrace?.decision || "unknown",
        status: latestTrace?.decision || "unknown",
        machines_affected: [...machines],
        traces,
      };
    });

    return NextResponse.json({ alerts: data });
  } catch (error: any) {
    if (
      String(error?.message || "").includes("ns does not exist") ||
      String(error?.message || "").includes("NamespaceNotFound")
    ) {
      // Normal behavior on totally fresh deployments before first alert
      return NextResponse.json({ alerts: [] }, { status: 200 });
    }
    
    // Hard error - database connection dropped, credentials rotated, etc.
    console.error(`[ExplainabilityAPI] Critical failure:`, error?.message || error);
    return NextResponse.json({ error: "Failed to fetch explainability traces" }, { status: 500 });
  }
}
