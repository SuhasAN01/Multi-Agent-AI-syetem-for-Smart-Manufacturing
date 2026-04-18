import { SENSOR_FIELDS, SENSOR_CONFIG } from "@/config/sensorConfig.js";

/**
 * Pure Mathematical Model for Digital Twin Degradation Physics
 * 
 * Modernized: Sensor-agnostic health calculation.
 */

/**
 * Calculates machine health based on all dynamic metrics.
 * @param {Object} record A reading object with metrics field.
 * @returns {number} 0-100 health score.
 */
function calculateHealth(record) {
  if (!record || !record.metrics) return 100;
  
  let healthPenalties = 0;
  
  SENSOR_FIELDS.forEach(field => {
    const value = record.metrics[field] || 0;
    const config = SENSOR_CONFIG[field];
    const warning = config.defaultThresholds.warning;
    
    // Penalty calculation: ratio above warning threshold
    if (value > warning) {
      // Scale penalty so that exceeding critical threshold by much reduces health significantly
      const excess = (value - warning) / warning;
      healthPenalties += excess * 30; // 30% penalty weight per threshold breach
    }
  });
  
  return Math.max(0, 100 - healthPenalties);
}

/**
 * Calculates Time-To-Failure (TTF) in hours based on telemetry degradation.
 * @param {Array<Object>} telemetryReadings Array of reading objects with timestamp, metrics
 * @returns {number} Estimated hours until failure, clamped between 1 and 168.
 */
export function calculateTTFHours(telemetryReadings) {
  if (!Array.isArray(telemetryReadings) || telemetryReadings.length < 2) return 72;
  
  const sorted = [...telemetryReadings].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
  
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  
  const firstHealth = calculateHealth(first);
  const lastHealth = calculateHealth(last);
  
  const dtHours = (new Date(last.timestamp).getTime() - new Date(first.timestamp).getTime()) / 36e5;
  if (!Number.isFinite(dtHours) || dtHours <= 0) return 72;
  
  const degradationPerHour = (firstHealth - lastHealth) / dtHours;
  if (!Number.isFinite(degradationPerHour) || degradationPerHour <= 0) {
    return 168; // No noticeable degradation
  }
  
  const failureHealthThreshold = 25;
  const remainingHealth = Math.max(lastHealth - failureHealthThreshold, 0);
  const ttf = remainingHealth / degradationPerHour;
  
  return Number(Math.max(Math.min(ttf, 168), 1).toFixed(1));
}

/**
 * Calculates a cascade risk score representing how dangerous a failure is to the rest of the factory line.
 */
export function calculateCascadeRisk(topologyDoc, ttfHours) {
  const downstream = Array.isArray(topologyDoc?.downstream_machines) ? topologyDoc.downstream_machines : [];
  
  if (downstream.length === 0) {
    return { cascadeRiskScore: 0, affectedMachines: [] };
  }
  
  const urgencyRisk = Math.max(0, 40 - Math.min(ttfHours, 40));
  const networkRisk = Math.min(downstream.length * 12, 60);
  const cascadeRiskScore = Math.min(100, Math.round(urgencyRisk + networkRisk + 8));
  const affectedMachines = downstream.map((entry) =>
    typeof entry === "string" ? entry : entry.machine_id
  );
  
  return {
    cascadeRiskScore,
    affectedMachines,
  };
}
