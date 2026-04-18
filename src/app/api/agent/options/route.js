export async function GET() {
  return Response.json([
    { id: "supervisor", name: "Supervisor Agent" },
    { id: "digitalTwin", name: "Digital Twin Agent" }
  ]);
}
