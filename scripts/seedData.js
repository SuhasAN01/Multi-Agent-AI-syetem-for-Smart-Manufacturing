import "dotenv/config";
import getMongoClientPromise from "../src/integrations/mongodb/client.js";
import { SENSOR_FIELDS, SENSOR_CONFIG } from "../src/config/sensorConfig.js";

const MACHINES = ["CNC_01", "CNC_02", "PUMP_03", "CONVEYOR_04"];

const BASELINES = {
  CNC_01:      { temperature: 72,  vibration: 1.8, rpm: 1480, current: 12.5 },
  CNC_02:      { temperature: 68,  vibration: 1.5, rpm: 1490, current: 11.8 },
  PUMP_03:     { temperature: 55,  vibration: 2.2, rpm: 2950, current: 18.0 },
  CONVEYOR_04: { temperature: 45,  vibration: 0.9, rpm:  720, current:  8.5 },
};

const rand  = (min, max) => Math.random() * (max - min) + min;
const noise = (base, pct) => base + rand(-base * pct, base * pct);
const fix   = (n, d = 2)  => parseFloat(n.toFixed(d));

function generateReading(machineId, timestamp, dayOffset, progress) {
  const b = BASELINES[machineId] || BASELINES.CNC_01;
  const metrics = {};
  
  SENSOR_FIELDS.forEach(field => {
    const base = b[field] || SENSOR_CONFIG[field].defaultThresholds.warning * 0.7;
    let val = noise(base, 0.03);
    
    // Inject anomalies for Step 4
    if (machineId === "CNC_01" && field === "vibration" && dayOffset < 2) {
      val += rand(2, 4); // Bearing wear simulation
    }
    if (machineId === "CNC_02" && field === "temperature" && progress > 0.6 && dayOffset === 1) {
      val += rand(20, 40); // Thermal runaway
    }
    
    metrics[field] = fix(val, field === 'vibration' ? 3 : 2);
  });

  return {
    machine_id: machineId,
    timestamp: timestamp.toISOString(),
    metrics: metrics,
    status: "running"
  };
}

async function seed() {
  console.log("Starting modernized data ingestion...");
  const client = await getMongoClientPromise();
  const db = client.db(process.env.DATABASE_NAME || "predictive_maintenance");

  // Clear old data
  await db.collection("sensor_readings").deleteMany({});
  await db.collection("sensor_thresholds").deleteMany({});
  await db.collection("incident_reports").deleteMany({});

  const now = Date.now();
  const DAYS = 7;
  const STEP_MS = 15 * 60 * 1000; // 1 reading every 15 mins for 7 days
  const TOTAL_MS = DAYS * 24 * 60 * 60 * 1000;

  const readings = [];
  
  for (const machineId of MACHINES) {
    console.log(`Generating history for ${machineId}...`);
    for (let offset = TOTAL_MS; offset >= 0; offset -= STEP_MS) {
      const ts = new Date(now - offset);
      const dayOffset = Math.floor(offset / (24 * 60 * 60 * 1000));
      const progress = (ts.getHours() * 3600 + ts.getMinutes() * 60 + ts.getSeconds()) / 86400;
      readings.push(generateReading(machineId, ts, dayOffset, progress));
    }
  }

  console.log(`Inserting ${readings.length} readings...`);
  await db.collection("sensor_readings").insertMany(readings);

  // STEP 2: Pre-compute thresholds (Decision 1)
  console.log("Computing historical thresholds (mean + 2*std)...");
  for (const machineId of MACHINES) {
    for (const field of SENSOR_FIELDS) {
      const fieldValues = readings
        .filter(r => r.machine_id === machineId)
        .map(r => r.metrics[field]);
      
      const mean = fieldValues.reduce((a, b) => a + b, 0) / fieldValues.length;
      const sqDiffs = fieldValues.map(v => Math.pow(v - mean, 2));
      const std = Math.sqrt(sqDiffs.reduce((a, b) => a + b, 0) / fieldValues.length);
      
      const critical = fix(mean + 2 * std);
      const warning = fix(mean + 1.2 * std);

      await db.collection("sensor_thresholds").insertOne({
        machine_id: machineId,
        sensor: field,
        mean: fix(mean),
        std: fix(std),
        warning,
        critical,
        updated_at: new Date().toISOString()
      });
    }
  }

  console.log("Seeding COMPLETE.");
  process.exit(0);
}

seed().catch(err => {
  console.error("Seeding FAILED:", err);
  process.exit(1);
});
