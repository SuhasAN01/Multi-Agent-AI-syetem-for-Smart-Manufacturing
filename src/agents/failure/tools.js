import { tool } from "@langchain/core/tools";
import { vectorSearch } from "@/integrations/mongodb/vectorSearch";
import getMongoClientPromise from "@/integrations/mongodb/client";
import { getTrendSummary } from "@/lib/sensorEngine";
import { SENSOR_FIELDS } from "@/config/sensorConfig";

export const retrieveManual = tool(
  async ({ query, n = 3 }) => {
    const dbConfig = {
      collection: "manuals",
      indexName: "default",
      textKey: ["text"],
      embeddingKey: "embedding",
      includeScore: true,
    };
    const result = await vectorSearch(query, dbConfig, n);
    return JSON.stringify(result);
  },
  {
    name: "retrieve_manual",
    description: "Retrieve the relevant manual for the alert via vector search.",
    schema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Name of the tool for identification purposes",
          enum: ["retrieve_manual"],
        },
        query: {
          type: "string",
          description: "The query to process",
        },
        n: {
          type: "number",
          description: "Number of results to return (optional, default 3)",
          default: 3,
        },
      },
      required: ["name", "query"],
    },
  }
);

export const retrieveWorkOrders = tool(
  async ({ query, n = 3 }) => {
    const dbConfig = {
      collection: "workorders",
      indexName: "default",
      textKey: ["title", "observations"],
      embeddingKey: "embedding",
      includeScore: true,
    };
    const result = await vectorSearch(query, dbConfig, n);
    return JSON.stringify(result);
  },
  {
    name: "retrieve_work_orders",
    description: "Retrieve related work orders for the alert via vector search.",
    schema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Name of the tool for identification purposes",
          enum: ["retrieve_work_orders"],
        },
        query: {
          type: "string",
          description: "The query to process",
        },
        n: {
          type: "number",
          description: "Number of results to return (optional, default 3)",
          default: 3,
        },
      },
      required: ["name", "query"],
    },
  }
);

/**
 * STEP 10: RAG trend tool for historical analysis.
 */
export const retrieveSensorHistory = tool(
  async ({ machine_id, sensor }) => {
    try {
      const summary = await getTrendSummary(machine_id, sensor);
      return JSON.stringify(summary);
    } catch (err) {
      return JSON.stringify({ error: err.message });
    }
  },
  {
    name: "retrieve_sensor_history",
    description: "Analyze historical trends for a specific machine and sensor to detect drift or anomalies.",
    schema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Name of the tool for identification purposes",
          enum: ["retrieve_sensor_history"],
        },
        machine_id: {
          type: "string",
          description: "The ID of the machine to analyze (e.g., CNC_01, PUMP_03)",
        },
        sensor: {
          type: "string",
          description: "The sensor field to analyze",
          enum: SENSOR_FIELDS,
        },
      },
      required: ["name", "machine_id", "sensor"],
    },
  }
);

export const generateIncidentReport = tool(
  async (params) => {
    const { name, ...rest } = params;
    const doc = { ...rest, ts: new Date() };

    const client = await getMongoClientPromise();
    const dbName = process.env.DATABASE_NAME;
    if (!dbName) throw new Error("DATABASE_NAME environment variable is required but not set");
    const db = client.db(dbName);
    const result = await db.collection("incident_reports").insertOne(doc);
    return JSON.stringify(result);
  },
  {
    name: "generate_incident_report",
    description: "Generate an incident report for the alert.",
    schema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Name of the tool for identification purposes",
          enum: ["generate_incident_report"],
        },
        error_code: {
          type: "string",
          description: "Error code for the incident",
        },
        error_name: {
          type: "string",
          description: "Error name for the incident",
        },
        root_cause: {
          type: "string",
          description: "Root cause of the incident inferred from the context",
        },
        repair_instructions: {
          type: "array",
          description: "Repair instructions (3 to 6 steps)",
          minItems: 3,
          maxItems: 6,
          items: {
            type: "object",
            properties: {
              step: { type: "integer" },
              description: { type: "string" },
            },
            required: ["step", "description"],
          },
        },
        machine_id: {
          type: "string",
          description: "ID of the machine involved in the incident",
        },
      },
      required: [
        "name",
        "error_code",
        "error_name",
        "root_cause",
        "repair_instructions",
        "machine_id",
      ],
    },
  }
);

export function getTools() {
  return [
    retrieveManual,
    retrieveWorkOrders,
    retrieveSensorHistory,
    generateIncidentReport,
  ];
}
