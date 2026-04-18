import getMongoClientPromise from "@/integrations/mongodb/client";
import { env } from "../../config/env.js";
import { AuditLogger } from "../../infrastructure/logging/auditLogger.js";
import { calculateTTFHours, calculateCascadeRisk } from "../../lib/simulation/degradationModel.js";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function safeJsonParse(content) {
  if (typeof content !== "string") return null;
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(content.slice(start, end + 1));
  } catch {
    return null;
  }
}

function getAlertFromState(state) {
  const messages = state.messages || [];
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const parsed = safeJsonParse(messages[i]?.content);
    if (parsed && parsed.machine_id) {
      return parsed;
    }
  }
  return null;
}

function normalizeMachineIds(machineId) {
  if (!machineId) return [];
  const value = String(machineId).trim();
  const ids = new Set([value]);
  const numeric = value.replace(/^M/i, "");
  if (numeric && numeric !== value) {
    ids.add(numeric);
    ids.add(`M${numeric}`);
  }
  return [...ids];
}

export async function digitalTwinAgent(state) {
  const alert = getAlertFromState(state);
  if (!alert) {
    return {
      messages: state.messages || [],
      alertSuppressed: false,
      digitalTwinContext: null,
    };
  }

  const client = await getMongoClientPromise();
  const db = client.db(env.DATABASE_NAME);

  const machineIdCandidates = normalizeMachineIds(alert.machine_id);
  const now = new Date();
  const since = new Date(now.getTime() - ONE_DAY_MS);

  // Database Execution Boundary
  const telemetryReadings = await db
    .collection("telemetry")
    .find({
      ts: { $gte: since, $lte: now },
      "metadata.machine_id": { $in: machineIdCandidates },
    })
    .sort({ ts: 1 })
    .toArray();

  const topologyDoc = await db.collection("machine_topology").findOne({
    machine_id: { $in: machineIdCandidates },
  });

  // Pure Math Execution Boundary
  const ttfHours = calculateTTFHours(telemetryReadings);
  const { cascadeRiskScore, affectedMachines } = calculateCascadeRisk(topologyDoc, ttfHours);
  const alertSuppressed = cascadeRiskScore < 20;

  // DB Writes & Logging Execution Boundary
  const simulation = {
    timestamp: now,
    machine_id: alert.machine_id,
    ttf_hours: ttfHours,
    cascade_risk_score: cascadeRiskScore,
    affected_machines: affectedMachines,
    source_alert_id: alert._id || null,
    suppressed: alertSuppressed,
  };

  try {
    await db.collection("digital_twin_simulations").insertOne(simulation);
  } catch (simWriteError) {
    console.warn("[digitalTwinAgent] Failed to write simulation result:", simWriteError?.message || simWriteError);
  }

  const enrichmentMessage = alertSuppressed
    ? `Digital twin simulation suppressed this alert. Cascade risk (${cascadeRiskScore}) is below threshold.`
    : `Digital twin simulation enriched alert with TTF ${ttfHours}h, cascade risk ${cascadeRiskScore}, affected machines: ${
        affectedMachines.join(", ") || "none"
      }.`;

  const digitalTwinContext = {
    ttf_hours: ttfHours,
    cascade_risk_score: cascadeRiskScore,
    affected_machines: affectedMachines,
    source_alert_id: alert._id || null,
  };

  // NON-BLOCKING logging - fulfills requirement
  AuditLogger.logDecision({
    alertId: alert._id,
    agentName: "digitalTwin",
    reasoningText: enrichmentMessage,
    decision: alertSuppressed ? "alert_suppressed" : "alert_enriched",
    context: { digital_twin: digitalTwinContext }
  }).catch(console.error);

  return {
    messages: [
      ...(state.messages || []),
      { role: "system", content: enrichmentMessage, name: "digitalTwinAgent" },
    ],
    alertSuppressed,
    digitalTwinContext,
    lastAgent: "digitalTwin",
  };
}
