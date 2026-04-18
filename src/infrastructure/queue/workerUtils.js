import { createAgentGraph } from "../../agents/failure/graph.js"; 
import getMongoClientPromise from "../../integrations/mongodb/client.js";
import { generateIssues } from "../../lib/sensorEngine.js";
import { normalizeMetrics } from "../../lib/sensorLogic.js";
import { getRecommendedAction } from "../../config/actionMap.js";
import { SENSOR_CONFIG } from "@/config/sensorConfig.js";

/**
 * Deterministic rule-engine report generator — zero LLM dependency.
 * Follows Step 4 & 7: FULL DYNAMIC.
 */
function generateDeterministicReport(alert, issues) {
  const machineId = alert?.machine_id || "unknown";
  
  // Aggregate severity
  const highestSeverity = issues.some(i => i.severity === "CRITICAL") ? "CRITICAL" : "WARNING";
  
  let reportBody = `${highestSeverity} Incident Report — Machine ${machineId}\n\n`;
  
  reportBody += "Detected Issues:\n";
  // STEP 4: STRICT DYNAMIC LOOP (No sensor-specific code)
  issues.forEach(issue => {
    const config = SENSOR_CONFIG[issue.type] || {};
    const label = config.label || issue.type;
    const unit = config.unit || "";
    // Output: - SENSOR_NAME: VALUE (SEVERITY)
    reportBody += `- ${label.toUpperCase()}: ${issue.value}${unit} (${issue.severity})\n`;
  });
  
  reportBody += "\nRecommended Actions:\n";
  const uniqueActions = [...new Set(issues.map(i => getRecommendedAction(i.type)))];
  uniqueActions.forEach(action => {
    reportBody += `- ${action}\n`;
  });

  return {
    severity: highestSeverity,
    report: reportBody,
    issues: issues
  };
}

/**
 * Persists an XAI audit trace for the agent's decision.
 */
async function logTrace(db, machineId, report, issues, source) {
  try {
    const trace = {
      alert_id: machineId,
      agent_name: source === "llm" ? "Leafy Failure Agent" : "Deterministic Rule Engine",
      timestamp: new Date(),
      reasoning_text: report,
      decision: issues.length > 0 ? "MAINTENANCE_REQUIRED" : "NORMAL",
      confidence_score: source === "llm" ? 0.95 : 1.0,
      digital_twin_context: {
        affected_machines: [machineId],
        severity: issues.some(i => i.severity === "CRITICAL") ? "CRITICAL" : "WARNING"
      }
    };
    await db.collection("agent_audit_traces").insertOne(trace);
    console.log("[XAI] Trace logged successfully");
  } catch (err) {
    console.error("[XAI] Trace log failed:", err.message);
  }
}

export async function processAlertJob(alertData, jobId, threadId) {
  // STEP 2: DEBUG LOGGING
  console.log("Incoming Metrics (raw):", alertData);

  // Decision 3: Normalize metrics automatically
  const normalizedMetrics = normalizeMetrics(alertData);
  console.log("Normalized Metrics:", normalizedMetrics);
  
  const machineId = alertData.machine_id || "unknown";

  let incidentReportContainer = null;
  let client, db;

  // ── Connect to MongoDB ──
  try {
    client = await getMongoClientPromise();
    const dbName = process.env.DATABASE_NAME;
    db = client.db(dbName);
  } catch (dbConnErr) {
    console.error("[WorkerUtils] MongoDB connection failed:", dbConnErr.message);
    return { status: "error", result: null };
  }

  // ── Step 4 & 6: Generate issues dynamically ──
  let issues = [];
  try {
    issues = await generateIssues(normalizedMetrics, machineId);
    // STEP 2: DEBUG LOGGING
    console.log("Generated Issues:", issues);
  } catch (err) {
    console.error("[WorkerUtils] Issue generation failed:", err.message);
  }

  // ── STEP 1: Try LLM (optional) ──
  try {
    if (process.env.USE_REAL_LLM === "true") {
      console.log("[WorkerUtils] USE_REAL_LLM is true. Invoking graph...");
      const graph = createAgentGraph(client, process.env.DATABASE_NAME);
      
      const agentInput = {
        machine_id: machineId,
        metrics: normalizedMetrics,
        issues: issues,
        trend_summary: {} 
      };
      
      const message = JSON.stringify(agentInput);

      const resultState = await graph.invoke(
        { messages: [{ role: "user", content: message }], digitalTwinContext: {} },
        { configurable: { thread_id: threadId } }
      );

      const msgs = resultState?.messages || [];
      const last = msgs.at(-1);
      const content = last?.content || last || null;

      if (content && typeof content === "string" && !content.includes("I apologize, but I encountered an error")) {
        incidentReportContainer = {
          report: content,
          severity: issues.some(i => i.severity === "CRITICAL") ? "CRITICAL" : "WARNING",
          issues: issues
        };
        console.log("[WorkerUtils] LLM produced report successfully");
      }
    }
  } catch (err) {
    console.error("[LLM FAILED]:", err.message);
  }

  // ── STEP 2: Force fallback if LLM produced nothing ──
  if (!incidentReportContainer) {
    incidentReportContainer = generateDeterministicReport({ machine_id: machineId }, issues);
    console.warn("[FALLBACK FORCED] Using deterministic report");
  }

  // ── STEP 5: Log XAI Trace ──
  await logTrace(db, machineId, incidentReportContainer.report, incidentReportContainer.issues, incidentReportContainer.report.includes("Auto-generated") ? "rule-engine" : "llm");

  // ── STEP 3: Guaranteed DB insert ──
  try {
    await db.collection("incident_reports").insertOne({
      alertId: machineId,
      machine_id: machineId,
      metrics: normalizedMetrics,
      issues: incidentReportContainer.issues,
      severity: incidentReportContainer.severity,
      report: incidentReportContainer.report,
      source: incidentReportContainer.report.includes("Auto-generated") ? "fallback" : "rule-engine",
      created_at: new Date(),
      job_id: jobId,
    });
    console.log("[DB INSERT SUCCESS]");
  } catch (dbErr) {
    console.error("[DB INSERT FAILED]", dbErr.message);
  }

  // ── STEP 4: Guaranteed job_tracking update ──
  try {
    await db.collection("job_tracking").updateOne(
      { job_id: jobId },
      {
        $set: {
          status: "COMPLETED",
          result: incidentReportContainer.report,
          severity: incidentReportContainer.severity,
          updated_at: new Date(),
        }
      },
      { upsert: true }
    );
    console.log("[JOB TRACKING UPDATED] → COMPLETED");
  } catch (jtErr) {
    console.error("[JOB TRACKING FAILED]", jtErr.message);
  }

  return { status: "success", result: incidentReportContainer.report };
}
