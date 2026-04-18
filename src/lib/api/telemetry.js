// Modernized Telemetry API
// Step 3 & 5: Dynamic metrics persistence

export async function persistTelemetry(telemetry) {
  // Normalize date
  const timestamp = telemetry.timestamp && telemetry.timestamp.$date
    ? { $date: telemetry.timestamp.$date }
    : { $date: new Date().toISOString() };

  // Decision 3: Ensure metrics object exists
  const metrics = telemetry.metrics || {
    temperature: telemetry.temperature?.value,
    vibration: telemetry.vibration?.value
  };

  const doc = {
    ts: timestamp,
    timestamp: timestamp.$date, // Redundant for easier querying
    metadata: telemetry.metadata || { machine_id: telemetry.machine_id || "M1" },
    machine_id: telemetry.machine_id || "M1",
    metrics: metrics
  };

  await fetch("/api/action/insertOne", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "insertOne",
      collection: "telemetry",
      document: doc,
    }),
  });
}
