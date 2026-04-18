"use client";
import React from "react";
import dynamic from "next/dynamic";
import Button from "@leafygreen-ui/button";
import CardList from "@/components/cardList/CardList";
import AgentStatus from "@/components/agentStatus/AgentStatus";
import WorkOrderForm from "@/components/forms/workOrderForm/WorkOrderForm";
import { useWorkOrderGenerationPage } from "./hooks";
import LeafyGreenProvider from "@leafygreen-ui/leafygreen-provider";
import { H3, Description } from "@leafygreen-ui/typography";

const Code = dynamic(
  () => import("@leafygreen-ui/code").then((mod) => mod.Code),
  { ssr: false }
);

export default function Page() {
  const {
    selectedIncidentId,
    handleIncidentSelect,
    canContinue,
    handleContinueWorkflow,
    workorders,
    selectedWorkOrder,
    setSelectedWorkOrder,
    agentStatus,
    showModal,
    setShowModal,
    modalContent,
    incidentReports,
    emptyIncidentText,
    agentLogs,
    selectedIncident
  } = useWorkOrderGenerationPage();

  // STEP 7: Debug selection
  React.useEffect(() => {
    if (selectedWorkOrder) {
      console.log("Selected Work Order in Page:", selectedWorkOrder.id);
    }
  }, [selectedWorkOrder]);

  return (
    <LeafyGreenProvider baseFontSize={16}>
      <main className="flex flex-col w-full h-full">
        {/* Page Title & Subheader */}
        <div className="flex flex-col items-start justify-center px-6 py-4">
          <H3 className="mb-1 text-left">Process Automation</H3>
          <Description className="text-left max-w-2xl mb-2">
            Dynamic Work Orders: Instantly generated tasks with editable form controls.
          </Description>
        </div>

        <div className="flex flex-1 min-h-0 w-full gap-6 px-4 pb-4">
          {/* LEFT PANEL: Selection & List (3/5 width) */}
          <section className="flex flex-col w-3/5 border border-gray-200 rounded-xl bg-white p-4 overflow-hidden min-w-[400px]">
            <div className="flex justify-between items-center mb-4">
              <Button
                disabled={!canContinue}
                variant="primary"
                onClick={handleContinueWorkflow}
              >
                Continue Workflow
              </Button>
              {selectedIncident && (
                <div className="px-3 py-1 bg-blue-50 text-blue-700 rounded-md text-sm font-medium border border-blue-100">
                  Target: {selectedIncident.machine_id}
                </div>
              )}
            </div>

            <div className="flex flex-1 flex-col gap-4 min-h-0 overflow-hidden">
              {/* 1. Incident Reports */}
              <div className="flex-1 min-h-0">
                <CardList
                  items={incidentReports}
                  idField="_id"
                  cardType="incident-reports"
                  selectable
                  selectedId={selectedIncidentId}
                  onSelect={handleIncidentSelect}
                  maxHeight="max-h-full"
                  emptyText={emptyIncidentText || "No incident reports found."}
                  listTitle="1. Select Incident"
                />
              </div>

              {/* 2. Work Orders List */}
              <div className="flex-1 min-h-0 border-t pt-4 border-gray-100">
                <CardList
                  items={workorders}
                  idField="id"
                  cardType="workorders"
                  selectable
                  selectedId={selectedWorkOrder?.id}
                  onSelect={(id) => {
                    const found = workorders.find(wo => wo.id === id);
                    if (found) setSelectedWorkOrder(found);
                  }}
                  maxHeight="max-h-full"
                  emptyText="Click 'Continue Workflow' to generate tasks."
                  listTitle="2. Generated Tasks"
                />
              </div>
            </div>
          </section>

          {/* RIGHT PANEL: Form & Agent (2/5 width) */}
          <section className="flex flex-col w-2/5 gap-4 overflow-hidden min-w-[320px]">
             {/* STEP 3 & 8: WorkOrderForm (Primary Focus) */}
             <div className="flex-1 min-h-0 overflow-y-auto pr-2">
                <WorkOrderForm 
                   workOrder={selectedWorkOrder} 
                   onChange={setSelectedWorkOrder}
                />
             </div>

             {/* AI Agent Status & Logs (Secondary) */}
             <div className="h-1/3 border border-gray-200 rounded-xl bg-slate-50 p-4 overflow-hidden flex flex-col">
                <div className="flex justify-center mb-2">
                  <AgentStatus
                    isActive={agentStatus === "active"}
                    onInfo={() => setShowModal(true)}
                    onCloseModal={() => setShowModal(false)}
                    showModal={showModal}
                    modalContent={modalContent}
                    statusText="Leafy AI"
                    activeText="Analyzing..."
                    inactiveText="Insights"
                    logs={agentLogs || []}
                  />
                </div>
                <div className="flex-1 bg-white border border-gray-200 rounded p-2 overflow-y-auto text-xs italic text-gray-500 font-mono">
                   {agentStatus === "active" ? "Agent is searching historical archives..." : "Analysis ready. See logs for reasoning."}
                   {agentLogs.length > 0 && (
                      <div className="mt-2 text-blue-600">
                         {agentLogs.at(-1)?.values?.content?.substring(0, 100)}...
                      </div>
                   )}
                </div>
             </div>
          </section>
        </div>
      </main>
    </LeafyGreenProvider>
  );
}
