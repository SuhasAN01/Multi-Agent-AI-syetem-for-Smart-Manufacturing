// Incident Reports API

export async function fetchIncidentReports() {
  try {
    const res = await fetch("/api/action/find", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        collection: "incident_reports",
        filter: {},
        sort: { created_at: -1, _id: -1 },
        limit: 10,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      console.log("[IncidentReports] Fetched incidents:", data?.length || 0);
      return data;
    }
    console.error("[IncidentReports] Fetch failed:", res.status);
    return [];
  } catch (err) {
    console.error("[IncidentReports] Fetch error:", err);
    return [];
  }
}
