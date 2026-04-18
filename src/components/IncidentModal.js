import React from "react";
import Button from "@leafygreen-ui/button";
import Modal from "@leafygreen-ui/modal";
import { H3, Body } from "@leafygreen-ui/typography";
import StatusBadge from "@/components/StatusBadge";

export default function IncidentModal({
  open,
  setOpen,
  incidentData,
  onGenerateWorkOrder,
}) {
  if (!incidentData) return null;

  const { sensor, value, threshold, time, rootCause, repairInstructions } = incidentData;

  const handleGenerate = () => {
    if (onGenerateWorkOrder) {
      onGenerateWorkOrder(incidentData);
    }
    setOpen(false);
  };

  return (
    <Modal open={open} setOpen={setOpen} size="default">
      <div className="flex justify-between items-center mb-4">
        <H3 className="text-red-600">Critical Anomaly Detected</H3>
        <StatusBadge severity="CRITICAL" />
      </div>

      <div className="bg-slate-50 p-4 rounded-lg border border-gray-200 mb-6 font-mono text-sm">
        <p className="mb-1 text-gray-700">
          <span className="font-bold">Time:</span> {time}
        </p>
        <p className="mb-1 text-gray-700">
          <span className="font-bold">Sensor:</span> {sensor}
        </p>
        <p className="text-red-600 font-bold">
          Value reached {Number(value).toFixed(2)} (Threshold: {threshold})
        </p>
      </div>

      <div className="mb-6">
        <h4 className="text-sm font-bold text-gray-800 uppercase tracking-wide mb-2">Automated AI Insights</h4>
        <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded-md">
          <div className="mb-3">
            <span className="font-semibold block text-gray-800">Root Cause Verification:</span>
            <span className="text-gray-700 text-sm">
              {rootCause || "Analyzing anomaly logs... (No root cause matched for this exact frame. Checking deterministic fallback: High anomaly detected on component.)"}
            </span>
          </div>
          <div>
             <span className="font-semibold block text-gray-800">Suggested Action:</span>
             <span className="text-gray-700 text-sm">
               {repairInstructions || "Issue work order immediately. Isolate affected sensor block."}
             </span>
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
        <Button variant="default" onClick={() => setOpen(false)}>
          Ignore
        </Button>
        <Button variant="primary" onClick={handleGenerate} href="/workorder-generation">
          Generate Work Order
        </Button>
      </div>
    </Modal>
  );
}
