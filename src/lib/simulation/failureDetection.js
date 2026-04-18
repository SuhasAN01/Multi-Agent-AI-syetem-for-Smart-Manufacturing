import { SENSOR_FIELDS, SENSOR_CONFIG } from "@/config/sensorConfig.js";
import { normalizeMetrics } from "../sensorLogic.js";

/**
 * Modernized failure detection logic.
 * Step 1 & 4: Zero hardcoded sensors. Loop dynamically.
 */
export function checkForAlert(machineData, currentAlerts = [], status) {
  // STEP 4: Use centralized dynamic normalization
  const metrics = normalizeMetrics(machineData);

  const machineId = machineData.machine_id || "M1";
  const now = new Date();

  for (const field of SENSOR_FIELDS) {
    const value = metrics[field];
    if (value === undefined) continue;

    const config = SENSOR_CONFIG[field];
    const criticalThreshold = config.defaultThresholds.critical;
    
    // Check if this specific sensor already has an active unresolved alert
    const isAlreadyAlerting = currentAlerts.some(
      (a) => a.sensor === field && !a.resolved
    );

    if (value > criticalThreshold && !isAlreadyAlerting && status !== "alert") {
      return {
        _id: `alert-${field}-${now.getTime()}`,
        sensor: field,
        err_code: `E-${field.toUpperCase().substring(0, 3)}`,
        err_name: `High ${config.label}`,
        machine_id: machineId,
        ts: now.toLocaleString(),
        metrics: metrics, // Step 5: Standard alert payload
        details: metrics // Backward compatibility
      };
    }
  }

  return null;
}
