"use client";
import React from "react";
import dynamic from "next/dynamic";
import Button from "@leafygreen-ui/button";
import { H3, Description } from "@leafygreen-ui/typography";
import { useFailureDetectionPage } from "./hooks";
import MachineController from "@/components/machineController/MachineController";
import CardList from "@/components/cardList/CardList";
import AgentStatus from "@/components/agentStatus/AgentStatus";
import LeafyGreenProvider from "@leafygreen-ui/leafygreen-provider";

const Code = dynamic(
  () => import("@leafygreen-ui/code").then((mod) => mod.Code),
  { ssr: false }
);

import SensorChart from "@/components/SensorChart";
import IncidentModal from "@/components/IncidentModal";

export default function Page() {
  const [incidentModalOpen, setIncidentModalOpen] = React.useState(false);
  const [selectedAnomaly, setSelectedAnomaly] = React.useState(null);

  const {
    sim,
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
  } = useFailureDetectionPage();

  return (
    <LeafyGreenProvider baseFontSize={16}>
      <main className="flex flex-col w-full h-full">
        {/* Page Title & Subheader */}
        <div className="flex flex-col items-start justify-center px-6 py-4">
          <H3 className="mb-1 text-left">Root Cause Analysis</H3>
          <Description className="text-left max-w-2xl mb-2">
            Analyze machine incidents and agent responses in real time. Click blinking red anomalies to trigger AI insights.
          </Description>
        </div>

        <IncidentModal 
           open={incidentModalOpen} 
           setOpen={setIncidentModalOpen} 
           incidentData={selectedAnomaly} 
        />

        <div className="flex flex-1 min-h-0 w-full gap-6 px-2 pb-4">
          {/* Left Section: Machine Simulation */}
          <section className="flex flex-col w-1/2 border border-gray-200 rounded-xl bg-white p-4 m-2 overflow-hidden min-w-[320px] min-h-[320px]">
            {/* Top part: Buttons and MachineController */}
            <div className="flex flex-row w-full gap-4 mb-4 min-h-[100px] max-h-[140px]">
              {/* Left: Buttons */}
              <div
                className="flex flex-col gap-2 items-center justify-center h-full"
                style={{ flexBasis: "30%", minWidth: 120 }}
              >
                <Button
                  variant={sim.isRunning ? "danger" : "primary"}
                  onClick={sim.isRunning ? handleStop : handleStart}
                  className="mb-2 w-full"
                >
                  {sim.isRunning ? "Stop Simulator" : "Start Simulator"}
                </Button>
                <Button
                  variant="default"
                  onClick={() => setShowTelemetry((v) => !v)}
                  className="w-full"
                >
                  {showTelemetry ? "Hide Telemetry" : "Show Telemetry"}
                </Button>
              </div>
              {/* Right: MachineController (Step 11: Dynamic Sliders) */}
              <div className="flex-1 flex items-center min-w-0 h-full">
                <MachineController
                  status={sim.status}
                  sensorValues={sim.sensorValues}
                  onSensorChange={sim.onSensorChange}
                />
              </div>
            </div>
            {/* Bottom part: Alerts and (optionally) Telemetry */}
            {showTelemetry ? (
              <div className="flex flex-1 gap-4 min-h-0 overflow-hidden">
                {/* Left: Dashboard Grid */}
                <div className="w-2/3 flex flex-col min-w-[180px] h-full p-2 bg-slate-50 border border-gray-200 rounded-lg overflow-y-auto">
                  <div className="font-semibold mb-3 text-gray-800">Live Telemetry Analysis</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <SensorChart
                      title="Temperature (°C)"
                      data={sim.telemetryHistory || []}
                      dataKey="temperature"
                      color="#E84F52" // Red for temperature
                      threshold={80}
                      onAnomalyClick={(data) => {
                        setSelectedAnomaly({ ...data, rootCause, repairInstructions });
                        setIncidentModalOpen(true);
                      }}
                    />
                    <SensorChart
                      title="Vibration (g)"
                      data={sim.telemetryHistory || []}
                      dataKey="vibration"
                      color="#E38939" // Orange for vibration
                      threshold={1.5}
                      onAnomalyClick={(data) => {
                        setSelectedAnomaly({ ...data, rootCause, repairInstructions });
                        setIncidentModalOpen(true);
                      }}
                    />
                    <SensorChart
                      title="RPM"
                      data={sim.telemetryHistory || []}
                      dataKey="rpm"
                      color="#3EABF8" // Blue for RPM
                      threshold={3000}
                      onAnomalyClick={(data) => {
                        setSelectedAnomaly({ ...data, rootCause, repairInstructions });
                        setIncidentModalOpen(true);
                      }}
                    />
                    <SensorChart
                      title="Current (A)"
                      data={sim.telemetryHistory || []}
                      dataKey="current"
                      color="#5AC35A" // Green for current
                      threshold={20}
                      onAnomalyClick={(data) => {
                        setSelectedAnomaly({ ...data, rootCause, repairInstructions });
                        setIncidentModalOpen(true);
                      }}
                    />
                  </div>
                </div>

                {/* Right: Alerts */}
                <div className="w-1/3 flex flex-col min-w-[180px] h-full">
                  <CardList
                    items={sim.alerts}
                    idField="_id"
                    cardType="alerts"
                    maxHeight="max-h-full"
                    emptyText="No alerts"
                    listTitle="Alerts"
                    listDescription="Trigger alerts by exceeding thresholds."
                  />
                </div>
              </div>
            ) : (
              <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
                <CardList
                  items={sim.alerts}
                  idField="_id"
                  cardType="alerts"
                  maxHeight="max-h-full"
                  emptyText="No alerts"
                  listTitle="Alerts"
                  listDescription="Trigger alerts by exceeding thresholds."
                />
              </div>
            )}
          </section>
          {/* Right Section: Agent Response */}
          <section className="flex flex-col w-1/2 border border-gray-200 rounded-xl bg-white p-4 m-2 overflow-hidden min-w-[320px] min-h-[320px]">
            {/* AgentStatus centered */}
            <div className="flex justify-center mb-8 w-full">
              <div className="w-full">
                <AgentStatus
                  isActive={agentActive}
                  showModal={showModal}
                  onCloseModal={() => setShowModal(false)}
                  setShowModal={setShowModal}
                  modalContent={modalContent}
                  logs={agentLogs || []}
                  statusText="Agent"
                  activeText="Active"
                  inactiveText="Inactive"
                />
              </div>
            </div>
            {/* Incident Reports CardList fills available space */}
            <div className="flex flex-1 min-h-0 overflow-hidden">
              <CardList
                items={incidentReports}
                idField="_id"
                cardType="incident-reports"
                maxHeight="max-h-full"
                emptyText="No incident reports"
                listTitle="Incident Reports"
                listDescription="Automated incident reports with root cause analysis."
              />
            </div>
          </section>
        </div>
      </main>
    </LeafyGreenProvider>
  );
}
