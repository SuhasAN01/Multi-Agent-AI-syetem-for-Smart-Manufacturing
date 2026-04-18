import "server-only";
import { MongoClient, ServerApiVersion } from "mongodb";
import { env } from "../../config/env.js"; // Strictly validated env

if (typeof window !== "undefined") {
  throw new Error("CRITICAL SECURITY ERROR: MongoDB client attempt in browser context.");
}

let client;
let clientPromise;

function createMongoClient() {
  const uri = env.MONGODB_URI;
  const options = {
    appName: "genai-predictive-maintenance",
    serverApi: {
      version: ServerApiVersion.v1,
      strict: false,
      deprecationErrors: true,
    },
    // Production stability & Atlas fix:
    tls: true,
    // Fail-fast timeout config to prevent hanging agents
    serverSelectionTimeoutMS: 5000,
    // Ensure network resiliency for side effect operations
    retryWrites: true,
  };
  return new MongoClient(uri, options);
}

function getMongoClientPromise() {
  if (env.NODE_ENV === "development") {
    if (!global._mongoClientPromise) {
      client = createMongoClient();
      global._mongoClientPromise = client.connect();
    }
    clientPromise = global._mongoClientPromise;
  } else {
    if (!clientPromise) {
      client = createMongoClient();
      clientPromise = client.connect();
    }
  }
  return clientPromise;
}

export async function closeMongoClient() {
  if (client) {
    await client.close();
    client = undefined;
    clientPromise = undefined;
    if (global._mongoClientPromise) {
      global._mongoClientPromise = undefined;
    }
  }
}

export default getMongoClientPromise;
