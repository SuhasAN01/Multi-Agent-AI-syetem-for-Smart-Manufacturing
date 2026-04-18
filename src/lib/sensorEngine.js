/**
 * SERVER-ONLY SENSOR ENGINE
 * Orchestrates DB-dependent threshold calculation and trend analysis.
 * Step 13: Hybrid Architecture.
 */
import "server-only";
import getMongoClientPromise from "../integrations/mongodb/client.js";
import { SENSOR_CONFIG } from "@/config/sensorConfig.js";
import { evaluateMetric } from "./sensorLogic.js";

const thresholdCache = new Map();

/**
 * Computes thresholds (mean + 2*std) using a hybrid window (last 24h primary, 7d fallback).
 * Requires Database access.
 */
export async function getThreshold(sensor, machine_id) {
  const cacheKey = `${machine_id}:${sensor}`;
  if (thresholdCache.has(cacheKey)) {
    return thresholdCache.get(cacheKey);
  }

  const client = await getMongoClientPromise();
  const db = client.db(process.env.DATABASE_NAME);
  
  const stored = await db.collection("sensor_thresholds").findOne({ machine_id, sensor });
  if (stored && (Date.now() - new Date(stored.updated_at).getTime() < 1000 * 60 * 60)) { 
    thresholdCache.set(cacheKey, stored);
    return stored;
  }

  const now = Date.now();
  const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);

  let data = await db.collection("sensor_readings")
    .find({ machine_id, [`metrics.${sensor}`]: { $exists: true }, timestamp: { $gte: oneDayAgo.toISOString() } })
    .toArray();

  if (data.length < 50) { 
    data = await db.collection("sensor_readings")
      .find({ machine_id, [`metrics.${sensor}`]: { $exists: true }, timestamp: { $gte: sevenDaysAgo.toISOString() } })
      .toArray();
  }

  let warning, critical, mean = 0, std = 0;

  if (data.length > 0) {
    const values = data.map(d => d.metrics[sensor]);
    mean = values.reduce((a, b) => a + b, 0) / values.length;
    const sqDiffs = values.map(v => Math.pow(v - mean, 2));
    std = Math.sqrt(sqDiffs.reduce((a, b) => a + b, 0) / values.length);
    
    critical = mean + 2 * std;
    warning = mean + 1.2 * std;
  } else {
    const config = SENSOR_CONFIG[sensor]?.defaultThresholds;
    warning = config?.warning || 80;
    critical = config?.critical || 100;
  }

  const result = {
    machine_id,
    sensor,
    mean,
    std,
    warning,
    critical,
    updated_at: new Date().toISOString()
  };

  await db.collection("sensor_thresholds").updateOne(
    { machine_id, sensor },
    { $set: result },
    { upsert: true }
  );
  
  thresholdCache.set(cacheKey, result);
  return result;
}

/**
 * Generates issues using dynamic historical thresholds.
 * Requires Database access.
 */
export async function generateIssues(metrics, machine_id) {
  const issues = [];
  for (const [sensor, value] of Object.entries(metrics)) {
    const threshold = await getThreshold(sensor, machine_id);
    const severity = evaluateMetric(sensor, value, threshold);
    if (severity !== "NORMAL") {
      issues.push({
        type: sensor,
        severity,
        value,
        threshold: severity === "CRITICAL" ? threshold.critical : threshold.warning
      });
    }
  }
  return issues;
}

/**
 * Analyzes historical data to find trends.
 * Requires Database access.
 */
export async function getTrendSummary(machine_id, sensor) {
  const client = await getMongoClientPromise();
  const db = client.db(process.env.DATABASE_NAME);
  
  const data = await db.collection("sensor_readings")
    .find({ machine_id, [`metrics.${sensor}`]: { $exists: true } })
    .sort({ timestamp: -1 })
    .limit(12)
    .toArray();

  if (data.length < 2) {
    return { trend: "stable", change_percent: 0, avg: 0, max: 0, status: "insufficient_data" };
  }

  const values = data.map(d => d.metrics[sensor]).reverse();
  const latest = values[values.length - 1];
  const previous = values[0];
  
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const max = Math.max(...values);
  
  const change = latest - previous;
  const changePercent = previous !== 0 ? (change / previous) * 100 : 0;
  
  let trend = "stable";
  if (changePercent > 5) trend = "increasing";
  if (changePercent < -5) trend = "decreasing";

  return {
    trend,
    change_percent: Number(changePercent.toFixed(2)),
    avg: Number(avg.toFixed(2)),
    max: Number(max.toFixed(2)),
    current: latest,
    period_samples: data.length
  };
}
