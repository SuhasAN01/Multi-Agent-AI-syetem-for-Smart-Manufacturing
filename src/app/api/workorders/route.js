import { NextResponse } from "next/server";
import getMongoClientPromise from "@/integrations/mongodb/client.js";

/**
 * Work Orders API Route
 * Handles persistence and retrieval of maintenance tasks.
 */

export async function POST(req) {
  try {
    const dbName = process.env.DATABASE_NAME;
    const client = await getMongoClientPromise();
    const db = client.db(dbName);

    const body = await req.json();
    const workOrders = Array.isArray(body) ? body : [body];

    if (workOrders.length === 0) {
      return NextResponse.json({ success: true, count: 0 });
    }

    // Add timestamp if missing
    const preparedOrders = workOrders.map(order => ({
      ...order,
      created_at: order.created_at || new Date().toISOString(),
      status: order.status || "new"
    }));

    const result = await db.collection("workorders").insertMany(preparedOrders);

    return NextResponse.json({ 
      success: true, 
      count: result.insertedCount,
      ids: result.insertedIds 
    });
  } catch (error) {
    console.error("[API WorkOrders POST] Error:", error.message);
    return NextResponse.json({ error: "Failed to persist work orders" }, { status: 500 });
  }
}

export async function GET() {
  try {
    const dbName = process.env.DATABASE_NAME;
    const client = await getMongoClientPromise();
    const db = client.db(dbName);

    // Fetch last 50 workorders sorted by creation date
    const workOrders = await db
      .collection("workorders")
      .find({})
      .sort({ created_at: -1 })
      .limit(50)
      .toArray();

    return NextResponse.json(workOrders);
  } catch (error) {
    console.error("[API WorkOrders GET] Error:", error.message);
    return NextResponse.json({ error: "Failed to fetch work orders" }, { status: 500 });
  }
}
