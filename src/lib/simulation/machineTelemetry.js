import { SENSOR_FIELDS, SENSOR_CONFIG } from "@/config/sensorConfig.js";

/**
 * Modernized telemetry simulation. 
 * Step 1: No hardcoded sensor fields.
 */
export function getInitialMachineData() {
  const metrics = {};
  
  // Initialize all configured sensors with baseline values
  SENSOR_FIELDS.forEach(field => {
    const config = SENSOR_CONFIG[field];
    // Baseline is roughly warning threshold * 0.7
    metrics[field] = Number((config.defaultThresholds.warning * 0.7).toFixed(2));
  });

  return {
    machine_id: "M1",
    timestamp: new Date().toISOString(),
    metrics: metrics
  };
}

/**
 * Updates machine telemetry dynamically.
 * @param {Object} prev - Previous state
 * @param {Object} currentValues - Current slider values from UI
 */
export function updateMachineTelemetry(prev, currentValues) {
  const now = new Date();
  const newMetrics = {};

  SENSOR_FIELDS.forEach(field => {
    const baseValue = currentValues[field] !== undefined ? currentValues[field] : (prev.metrics?.[field] || 0);
    // Add small random noise: ±1% of the base value
    const noise = (Math.random() - 0.5) * (baseValue * 0.02);
    newMetrics[field] = Number((baseValue + noise).toFixed(2));
  });

  return {
    ...prev,
    timestamp: now.toISOString(),
    metrics: newMetrics
  };
}
