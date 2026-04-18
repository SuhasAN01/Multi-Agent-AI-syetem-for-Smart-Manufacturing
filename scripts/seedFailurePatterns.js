import "dotenv/config";
import getMongoClientPromise, {
  closeMongoClient,
} from "../src/integrations/mongodb/client.js";
import { generateEmbedding } from "../src/integrations/bedrock/embeddings.js";
import { createVectorSearchIndex } from "../src/integrations/mongodb/vectorSearch.js";

const PATTERNS = [
  {
    pattern_id: "FP-001",
    description:
      "Vibration spike on conveyor drive Machine A followed by bearing failure on press Machine B",
    trigger_machine_type: "conveyor",
    affected_machine_type: "press",
    trigger_signal: "vibration_rms",
    lag_hours: 48,
    historical_occurrences: 14,
    severity: "high",
  },
  {
    pattern_id: "FP-002",
    description:
      "Thermal drift in compressor unit leads to lubrication breakdown in downstream extruder gearbox",
    trigger_machine_type: "compressor",
    affected_machine_type: "extruder",
    trigger_signal: "temperature",
    lag_hours: 72,
    historical_occurrences: 9,
    severity: "high",
  },
  {
    pattern_id: "FP-003",
    description:
      "Repeated pressure oscillations in hydraulic pump precede seal wear in molding press",
    trigger_machine_type: "hydraulic_pump",
    affected_machine_type: "molding_press",
    trigger_signal: "pressure_delta",
    lag_hours: 36,
    historical_occurrences: 11,
    severity: "medium",
  },
  {
    pattern_id: "FP-004",
    description:
      "Elevated motor current harmonics on feeder line causes coupling fatigue in transfer robot",
    trigger_machine_type: "feeder",
    affected_machine_type: "robot",
    trigger_signal: "current_harmonics",
    lag_hours: 60,
    historical_occurrences: 7,
    severity: "medium",
  },
  {
    pattern_id: "FP-005",
    description:
      "Coolant flow degradation in chiller correlates with spindle overheating in CNC station",
    trigger_machine_type: "chiller",
    affected_machine_type: "cnc",
    trigger_signal: "coolant_flow",
    lag_hours: 24,
    historical_occurrences: 16,
    severity: "high",
  },
  {
    pattern_id: "FP-006",
    description:
      "Intermittent belt slip on upstream conveyor triggers misalignment faults in palletizer arm",
    trigger_machine_type: "conveyor",
    affected_machine_type: "palletizer",
    trigger_signal: "belt_slip_ratio",
    lag_hours: 18,
    historical_occurrences: 8,
    severity: "medium",
  },
  {
    pattern_id: "FP-007",
    description:
      "High humidity ingress in packaging zone leads to sensor drift and cutter jam events",
    trigger_machine_type: "packaging_line",
    affected_machine_type: "cutter",
    trigger_signal: "humidity",
    lag_hours: 30,
    historical_occurrences: 6,
    severity: "low",
  },
  {
    pattern_id: "FP-008",
    description:
      "Torque ripple in winding motor predicts bearing cage damage in downstream coiler",
    trigger_machine_type: "winder",
    affected_machine_type: "coiler",
    trigger_signal: "torque_ripple",
    lag_hours: 54,
    historical_occurrences: 10,
    severity: "high",
  },
  {
    pattern_id: "FP-009",
    description:
      "Abnormal acoustic bursts in blower fan are followed by impeller imbalance in dryer train",
    trigger_machine_type: "blower",
    affected_machine_type: "dryer",
    trigger_signal: "acoustic_peak",
    lag_hours: 42,
    historical_occurrences: 12,
    severity: "medium",
  },
  {
    pattern_id: "FP-010",
    description:
      "Valve cycle-time increase on steam header precedes actuator stiction on heat exchanger bypass",
    trigger_machine_type: "steam_header",
    affected_machine_type: "heat_exchanger",
    trigger_signal: "valve_cycle_time",
    lag_hours: 72,
    historical_occurrences: 5,
    severity: "low",
  },
];

async function seedFailurePatterns() {
  const dbName = process.env.DATABASE_NAME;
  if (!dbName) {
    throw new Error("DATABASE_NAME environment variable is required but not set");
  }
  const client = await getMongoClientPromise();
  const db = client.db(dbName);
  const collection = db.collection("historical_failure_patterns");

  for (const pattern of PATTERNS) {
    const embedding = await generateEmbedding(pattern.description);
    await collection.updateOne(
      { pattern_id: pattern.pattern_id },
      { $set: { ...pattern, embedding } },
      { upsert: true }
    );
    console.log(`[seedFailurePatterns] upserted ${pattern.pattern_id}`);
  }

  try {
    await createVectorSearchIndex(
      "historical_failure_patterns",
      "embedding",
      "failure_pattern_vector_index",
      "cosine",
      1024
    );
    console.log(
      "[seedFailurePatterns] Vector index ensured: failure_pattern_vector_index"
    );
  } catch (indexError) {
    console.warn(
      "[seedFailurePatterns] Could not create Atlas vector index automatically."
    );
    console.warn(
      "[seedFailurePatterns] Create this Search index manually on historical_failure_patterns:"
    );
    console.warn(
      JSON.stringify(
        {
          fields: [
            {
              type: "vector",
              path: "embedding",
              numDimensions: 1024,
              similarity: "cosine",
            },
          ],
        },
        null,
        2
      )
    );
    console.warn(indexError?.message || indexError);
  }
}

seedFailurePatterns()
  .then(async () => {
    await closeMongoClient();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error("[seedFailurePatterns] Fatal error:", error);
    await closeMongoClient();
    process.exit(1);
  });
