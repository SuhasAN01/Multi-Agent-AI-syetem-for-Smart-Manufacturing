import { useState, useRef, useCallback, useEffect } from "react";
import {
  getInitialMachineData,
  updateMachineTelemetry,
} from "@/lib/simulation/machineTelemetry";
import { checkForAlert } from "@/lib/simulation/failureDetection";
import { fetchIncidentReports } from "@/lib/api/incidentReports";
import { callFailureAgent } from "@/lib/api/agent";
import { fetchAlerts, persistAlert } from "@/lib/api/alerts";
import { persistTelemetry } from "@/lib/api/telemetry";
import { SENSOR_FIELDS, SENSOR_CONFIG } from "@/config/sensorConfig";

export function useFailureDetectionPage() {
  // Machine simulation logic
  const [alertTrigger, setAlertTrigger] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [machineData, setMachineData] = useState(getInitialMachineData());
  const [telemetryHistory, setTelemetryHistory] = useState([]); // Buffer for Recharts
  
  // STEP 11: Dynamic sensor values state
  const [sensorValues, setSensorValues] = useState(() => {
    const initial = {};
    SENSOR_FIELDS.forEach(field => {
      initial[field] = machineData.metrics?.[field] || SENSOR_CONFIG[field].defaultThresholds.warning * 0.7;
    });
    return initial;
  });

  const [status, setStatus] = useState("off");
  const [alerts, setAlerts] = useState([]);
  const [expandedAlertId, setExpandedAlertId] = useState(null);
  const intervalRef = useRef(null);
  const alertActiveRef = useRef(false);
  
  // Using a ref for the entire sensor object to avoid interval closure staleness
  const sensorValuesRef = useRef(sensorValues);
  const lastGeneratedAlertRef = useRef(null);
  const [showTelemetry, setShowTelemetry] = useState(false);

  useEffect(() => {
    sensorValuesRef.current = sensorValues;
  }, [sensorValues]);

  // Alerts
  const fetchAlertsCallback = useCallback(async () => {
    const data = await fetchAlerts();
    setAlerts(data);
  }, []);

  useEffect(() => {
    fetchAlertsCallback();
  }, [fetchAlertsCallback]);

  const persistAlertCallback = useCallback(
    async (alert) => {
      await persistAlert(alert);
      fetchAlertsCallback();
    },
    [fetchAlertsCallback]
  );

  // Telemetry
  const persistTelemetryCallback = useCallback(async (telemetry) => {
    await persistTelemetry(telemetry);
  }, []);

  // Simulation
  const handleStart = useCallback(() => {
    setIsRunning(true);
    setStatus("running");
    alertActiveRef.current = false;
    intervalRef.current = setInterval(() => {
      setMachineData((prev) => {
        // Step 1: dynamic update
        const updated = updateMachineTelemetry(
          prev,
          sensorValuesRef.current
        );
        
        // Persist telemetry to DB
        persistTelemetryCallback(updated);
        
        let newStatus = "running";
        let newAlert = null;
        
        // Step 1: dynamic threshold check
        const isExceeding = SENSOR_FIELDS.some(field => {
          const val = updated.metrics?.[field] || 0;
          return val > SENSOR_CONFIG[field].defaultThresholds.critical;
        });

        if (isExceeding && !alertActiveRef.current) {
          newAlert = checkForAlert(updated, alerts, status);
          if (newAlert) {
            lastGeneratedAlertRef.current = newAlert;
            persistAlertCallback(newAlert);
            newStatus = "alert";
            alertActiveRef.current = true;
            setAlertTrigger((prev) => prev + 1);
          }
        } else if (!isExceeding && alertActiveRef.current) {
          newStatus = "running";
          alertActiveRef.current = false;
        }
        
        setStatus(isExceeding ? "alert" : "running");

        // Maintain time-series history
        setTelemetryHistory(prevHist => {
          const newHist = [...prevHist, {
            time: new Date().toLocaleTimeString(),
            ...updated.metrics
          }];
          return newHist.slice(-50); // Keep last 50 points
        });

        return updated;
      });
    }, 1000);
  }, [status, alerts, persistTelemetryCallback, persistAlertCallback]);

  const handleStop = useCallback(() => {
    setIsRunning(false);
    setStatus("off");
    if (intervalRef.current) clearInterval(intervalRef.current);
  }, []);

  // Step 11: Dynamic change handler
  const onSensorChange = useCallback((field, v) => {
    setSensorValues((prev) => ({ ...prev, [field]: v }));
    setMachineData((prev) => ({
      ...prev,
      metrics: { ...prev.metrics, [field]: v },
    }));
  }, []);

  // Incident Reports
  const [agentActive, setAgentActive] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [incidentReports, setIncidentReports] = useState([]);
  const [rootCause, setRootCause] = useState("");
  const [repairInstructions, setRepairInstructions] = useState("");
  const processingRef = useRef(false);
  const lastAlertRef = useRef(alertTrigger);
  const [agentLogs, setAgentLogs] = useState([]);

  function formatRepairInstructions(instructions) {
    if (!Array.isArray(instructions)) return "";
    return instructions
      .map((step) => `- Step ${step.step}: ${step.description}`)
      .join("\n");
  }

  const fetchIncidentReportsCallback = useCallback(async () => {
    const data = await fetchIncidentReports();
    setIncidentReports(data);
  }, []);

  useEffect(() => {
    fetchIncidentReportsCallback();
    setRootCause("");
    setRepairInstructions("");
  }, [fetchIncidentReportsCallback]);

  useEffect(() => {
    if (typeof alertTrigger === "number") {
      if (alertTrigger !== lastAlertRef.current && !processingRef.current) {
        lastAlertRef.current = alertTrigger;
        setAgentActive(true);
        setAgentLogs([]); 
        const callAgentAsync = async () => {
          try {
            const alertToSend = lastGeneratedAlertRef.current;
            setAgentLogs((prev) => [
              ...prev,
              {
                type: "user",
                values: {
                  content:
                    "New alert received:\n" +
                    JSON.stringify(alertToSend, null, 2),
                },
              },
            ]);
            await callFailureAgent(alertToSend, {
              onEvent: (evt) => {
                if (
                  evt.type === "update" &&
                  (evt.name === "tool_start" || evt.name === "tool_end")
                ) {
                  setAgentLogs((prev) => [...prev, evt]);
                } else if (evt.type === "final") {
                  setAgentLogs((prev) => [...prev, evt]);
                } else if (evt.type === "error") {
                  setAgentLogs((prev) => [...prev, evt]);
                }
              },
            });
          } finally {
            setAgentActive(false);
            processingRef.current = false;
            const data = await fetchIncidentReports();
            setIncidentReports(data);
            if (data && data.length > 0) {
              setRootCause(data[0].root_cause || "");
              setRepairInstructions(
                formatRepairInstructions(data[0].repair_instructions)
              );
            } else {
              setRootCause("");
              setRepairInstructions("");
            }
          }
        };
        processingRef.current = true;
        callAgentAsync();
      } else {
        lastAlertRef.current = alertTrigger;
      }
    }
  }, [alertTrigger]);

  const modalContent = (
    <div className="p-4">
      <h3 className="text-lg font-semibold mb-2">Agent Info</h3>
      <div className="text-gray-600">(Agent details coming soon...)</div>
      <div className="mt-4 flex justify-end">
        <button
          className="bg-gray-200 px-4 py-2 rounded"
          onClick={() => setShowModal(false)}
        >
          Close
        </button>
      </div>
    </div>
  );

  return {
    sim: {
      isRunning,
      onSensorChange,
      sensorValues,
      machineData,
      status,
      alerts,
      expandedAlertId,
    },
    agentActive,
    showModal,
    setShowModal,
    rootCause,
    repairInstructions,
    incidentReports,
    modalContent,
    handleStart,
    handleStop,
    agentLogs,
    showTelemetry,
    setShowTelemetry,
    telemetryHistory,
  };
}
