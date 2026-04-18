import { useState, useEffect, useCallback, useRef } from "react";
import { fetchIncidentReports } from "@/lib/api/incidentReports";
import { fetchWorkOrders } from "@/lib/api/workOrders";
import { callWorkOrderAgent, pollBullMQJob } from "@/lib/api/agent";
import { ACTION_MAP } from "@/config/actionMap";

export function useWorkOrderGenerationPage() {
  const [incidentReports, setIncidentReports] = useState([]);
  const [selectedIncidentId, setSelectedIncidentId] = useState(null);
  
  // STEP 1: STATE MANAGEMENT
  const [workOrders, setWorkOrders] = useState([]); // Instant deterministic tasks
  const [selectedWorkOrder, setSelectedWorkOrder] = useState(null); // The one in the form
  
  const [dbWorkorders, setDbWorkorders] = useState([]); // Historical reference
  const [agentStatus, setAgentStatus] = useState("idle"); 
  const [showModal, setShowModal] = useState(false);
  const [emptyIncidentText, setEmptyIncidentText] = useState("");
  const [agentLogs, setAgentLogs] = useState([]);
  const processingRef = useRef(false);

  /**
   * Generates localized work orders from incident issues.
   */
  const generateWorkOrders = useCallback((incident) => {
    if (!incident || !incident.issues || !Array.isArray(incident.issues)) {
      return [{
        id: `fallback-${Date.now()}`,
        title: "General Maintenance Inspection",
        description: "Full system diagnostics required.",
        priority: "P2",
        status: "PENDING",
        machineId: incident?.machine_id || "Unknown",
        duration: "1",
        skills: "General Maintenance",
        materials: "Basic Toolset",
        observations: "No specific issues detected in automated log."
      }];
    }

    return incident.issues.map(issue => ({
      id: `${issue.type}-${Date.now()}`,
      title: `Resolve ${issue.type} issue`,
      description: ACTION_MAP[issue.type] || `Investigate ${issue.type}`,
      priority: issue.severity === "CRITICAL" ? "P1" : "P2",
      status: "PENDING",
      machineId: incident.machine_id,
      duration: "2", // Default
      skills: issue.type === "temperature" ? "HVAC Technician" : "Mechanical Engineer",
      materials: "Inspection Kit",
      observations: "Anomaly detected via dynamic rule engine."
    }));
  }, []);

  const triggerAIInsights = async (incident) => {
    try {
      setAgentLogs([{ type: "user", values: { content: "Requesting AI insights..." } }]);
      await callWorkOrderAgent(incident, {
        onEvent: (evt) => setAgentLogs((prev) => [...prev, evt]),
      });
    } catch (err) {
      console.warn("AI failed:", err.message);
    }
  };

  const fetchReports = useCallback(async () => {
    const data = await fetchIncidentReports();
    setIncidentReports(data);
    if (data?.length > 0) {
      setSelectedIncidentId(data[0]._id || data[0].Id);
    }
  }, []);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  const handleIncidentSelect = (id) => {
    setSelectedIncidentId(id);
    setWorkOrders([]);
    setSelectedWorkOrder(null);
  };

  const handleContinueWorkflow = async () => {
    const selectedIncident = incidentReports.find(
      (ir) => ir._id === selectedIncidentId || ir.Id === selectedIncidentId
    );
    if (!selectedIncident) return;

    // STEP 2: AUTO-SELECT FIRST WORK ORDER
    const orders = generateWorkOrders(selectedIncident);
    setWorkOrders(orders);
    
    // 🔥 STEP 3: PERSIST WORK ORDERS
    try {
      await fetch("/api/workorders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(orders)
      });
      console.log("[Persistence] Work orders saved successfully");
    } catch (saveErr) {
      console.error("[Persistence] Failed to save work orders:", saveErr.message);
    }
    
    if (orders.length > 0) {
      console.log("Auto-selecting first work order:", orders[0]);
      setSelectedWorkOrder(orders[0]);
    }

    setAgentStatus("active");
    triggerAIInsights(selectedIncident).finally(() => setAgentStatus("done"));
  };

  const modalContent = (
    <div className="p-4">
      <h3 className="text-lg font-semibold mb-2">Hybrid Architecture</h3>
      <p className="text-gray-600">Deterministic Logic + Async AI</p>
      <div className="mt-4 flex justify-end">
        <button className="bg-gray-200 px-4 py-2 rounded" onClick={() => setShowModal(false)}>Close</button>
      </div>
    </div>
  );

  return {
    selectedIncidentId,
    handleIncidentSelect,
    canContinue: !!selectedIncidentId,
    handleContinueWorkflow,
    workorders: workOrders,
    selectedWorkOrder,
    setSelectedWorkOrder,
    agentStatus,
    showModal,
    setShowModal,
    modalContent,
    incidentReports,
    emptyIncidentText,
    agentLogs,
    selectedIncident: incidentReports.find(ir => ir._id === selectedIncidentId || ir.Id === selectedIncidentId)
  };
}
