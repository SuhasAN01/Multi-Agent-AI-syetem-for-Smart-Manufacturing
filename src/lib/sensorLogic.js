/**
 * PURE SENSOR LOGIC - CLIENT & SERVER SAFE
 * No database dependencies. No Node.js-only modules.
 */

import { SENSOR_CONFIG } from "@/config/sensorConfig.js";

/**
 * Normalizes raw sensor data into the configured SENSOR_CONFIG structure.
 */
export function normalizeMetrics(rawMetrics) {
  if (!rawMetrics) return {};
  
  const normalized = {};
  
  Object.keys(SENSOR_CONFIG).forEach(sensor => {
    // Check top-level
    if (rawMetrics[sensor] !== undefined && rawMetrics[sensor] !== null) {
      normalized[sensor] = typeof rawMetrics[sensor] === 'object' 
        ? Number(rawMetrics[sensor].value ?? 0) 
        : Number(rawMetrics[sensor]);
    }
    // Check nested in .metrics (Standardized)
    else if (rawMetrics.metrics && rawMetrics.metrics[sensor] !== undefined) {
      normalized[sensor] = Number(rawMetrics.metrics[sensor]);
    }
    // Check nested in .details (Legacy)
    else if (rawMetrics.details && rawMetrics.details[sensor] !== undefined) {
      normalized[sensor] = Number(rawMetrics.details[sensor]);
    }
  });

  return normalized;
}

/**
 * Evaluates a numeric value against static thresholds.
 * For client-side preview and basic rule engine.
 */
export function evaluateMetric(sensor, value, threshold) {
  if (!threshold) {
    const config = SENSOR_CONFIG[sensor]?.defaultThresholds;
    threshold = {
      critical: config?.critical || Infinity,
      warning: config?.warning || Infinity
    };
  }

  if (value >= threshold.critical) return "CRITICAL";
  if (value >= threshold.warning) return "WARNING";
  return "NORMAL";
}

/**
 * Pure issue generation using static config thresholds.
 * Used for instant UI feedback (Step 14).
 */
export function generateIssuesStatic(metrics) {
  const issues = [];
  Object.entries(metrics).forEach(([sensor, value]) => {
    const config = SENSOR_CONFIG[sensor];
    if (!config) return;

    const severity = evaluateMetric(sensor, value, config.defaultThresholds);
    if (severity !== "NORMAL") {
      issues.push({
        type: sensor,
        severity,
        value,
        threshold: severity === "CRITICAL" ? config.defaultThresholds.critical : config.defaultThresholds.warning
      });
    }
  });
  return issues;
}
