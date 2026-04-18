import { streamAgentEvents } from "@/lib/stream/agent";

// Agent API (for /api/agent/* and /api/chat endpoints)

export async function fetchAgentOptions() {
  const res = await fetch("/api/agent/options");
  if (!res.ok) throw new Error("Failed to fetch agent options");
  return await res.json();
}

export async function sendChatMessage({
  message,
  agentId,
  threadId,
  setLogs,
  setThreadId,
  setError,
  signal,
}) {
  const response = await fetch("/api/alerts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, agentId }),
  });
  if (!response.ok) throw new Error("Failed to enqueue API job");
  const { jobId } = await response.json();

  let newThreadId = threadId;
  
  await pollBullMQJob(jobId, (evt) => {
    if (evt.type === "update") {
      setLogs((prev) => [...prev, evt]);
    } else if (evt.type === "final") {
      setLogs((prev) => [...prev, { ...evt, type: "final" }]);
    } else if (evt.type === "error") {
      setError(evt.values?.name || "Error");
      setLogs((prev) => [...prev, evt]);
    }
  }, signal);

  if (!newThreadId) setThreadId((prev) => prev || Date.now().toString());
}

export async function pollBullMQJob(jobId, onEvent, signal) {
  let isDone = false;
  let fullText = "";
  let timeoutStart = Date.now();
  const MAX_POLL_MS = 60000; // 60s hard timeout

  while (!isDone) {
    if (signal?.aborted) throw new Error("Polling aborted manually");
    if (Date.now() - timeoutStart > MAX_POLL_MS) {
       if (onEvent) onEvent({ type: "error", values: { name: "Job polling timed out after 60s" }});
       throw new Error("Job polling timed out");
    }

    await new Promise((resolve) => setTimeout(resolve, 2500));
    try {
      const statusRes = await fetch(`/api/alerts/status?jobId=${jobId}`);
      if (!statusRes.ok) continue;
      
      const { status, error, result } = await statusRes.json();
      
      if (status === "PROCESSING") {
        if (onEvent) onEvent({ type: "update", name: "tool_start", values: { name: "Agent Processing" }});
      }

      if (status === "FAILED") {
        isDone = true;
        if (onEvent) onEvent({ type: "error", values: { name: error || "Agent encountered an error." }});
        throw new Error(`Background job failed: ${error}`);
      }

      if (status === "COMPLETED") {
         isDone = true;
         fullText = result || "Agent processing complete. Background workflow finalized.";
         if (onEvent) onEvent({ type: "final", values: { content: fullText }});
      }
    } catch (err) {
      console.warn("Polling cycle error:", err);
    }
  }

  return fullText;
}

export async function callFailureAgent(alert, { onEvent } = {}) {
  const response = await fetch("/api/alerts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ alert, agentId: "failure" }),
  });
  if (!response.ok) throw new Error("Failed to enqueue failure job");
  const { jobId } = await response.json();
  
  // Inject immediate load UI state
  if (onEvent) onEvent({ type: "update", name: "tool_start", values: { name: "Job Scheduled" }});

  return await pollBullMQJob(jobId, onEvent);
}

export async function callWorkOrderAgent(incidentReport, { onEvent } = {}) {
  const response = await fetch("/api/alerts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ alert: incidentReport, agentId: "workorder" }),
  });
  if (!response.ok) throw new Error("Failed to enqueue workorder job");
  const { jobId } = await response.json();
  
  if (onEvent) onEvent({ type: "update", name: "tool_start", values: { name: "Job Scheduled" }});

  return await pollBullMQJob(jobId, onEvent);
}
