// @ts-nocheck
"use client";

import { useEffect, useState } from "react";
import { H2, Body, Description } from "@leafygreen-ui/typography";
import Card from "@leafygreen-ui/card";
import LeafyGreenProvider from "@leafygreen-ui/leafygreen-provider";

/**
 * Modernized XAI Dashboard
 * Renders direct agent reasoning traces from MongoDB.
 */
export default function ExplainabilityPage() {
  const [traces, setTraces] = useState([]);
  const [loading, setLoading] = useState(true);

  // STEP 8: LOAD XAI DASHBOARD
  useEffect(() => {
    async function fetchTraces() {
      try {
        const res = await fetch("/api/xai");
        const data = await res.json();
        setTraces(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error("Failed to load XAI traces:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchTraces();
  }, []);

  return (
    <LeafyGreenProvider baseFontSize={16}>
      <main className="w-full h-full overflow-auto py-6 px-10 bg-slate-50">
        <header className="mb-8">
          <H2 className="mb-2">Agent Audit - Historical Reasoning</H2>
          <Description>
            Audit trail of every machine detection, decision, and reasoning log.
          </Description>
        </header>

        {loading ? (
          <div className="flex items-center gap-2">
            <div className="animate-spin h-2 w-2 bg-blue-600 rounded-full"></div>
            <Body>Streaming traces from the edge...</Body>
          </div>
        ) : traces.length === 0 ? (
          <Card className="p-8 text-center border-dashed border-2">
            <Body className="text-gray-500">No audit traces available yet. Trigger an alert in Failure Prediction to see AI reasoning.</Body>
          </Card>
        ) : (
          <div className="grid gap-4">
            {/* STEP 9: RENDER XAI */}
            {traces.map((trace, idx) => (
              <Card key={trace._id || idx} className="p-5 flex flex-col gap-3 hover:shadow-md transition-shadow">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="text-lg font-bold text-gray-800">Machine: {trace.alert_id || "Unknown"}</h4>
                    <span className="text-xs text-gray-500 lowercase font-mono">
                      {new Date(trace.timestamp).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${Number(trace.confidence_score) > 0.9 ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                       Confidence: {((trace.confidence_score || 0) * 100).toFixed(0)}%
                    </span>
                    <span className="px-2 py-0.5 rounded text-xs font-bold bg-gray-100 text-gray-700">
                      {trace.agent_name}
                    </span>
                  </div>
                </div>

                <div className="bg-gray-50 p-4 rounded-lg border border-gray-100 text-sm text-gray-700 leading-relaxed italic border-l-4 border-l-blue-400">
                  {trace.reasoning_text}
                </div>

                <div className="flex gap-4 text-xs font-medium text-gray-500">
                   <div className="flex items-center gap-1">
                      <div className={`h-2 w-2 rounded-full ${trace.decision === 'MAINTENANCE_REQUIRED' ? 'bg-red-500' : 'bg-green-500'}`}></div>
                      Decision: {trace.decision}
                   </div>
                   {trace.digital_twin_context?.severity && (
                     <div className="bg-orange-50 text-orange-700 px-2 py-0.5 rounded border border-orange-100 uppercase tracking-tight">
                        Severity: {trace.digital_twin_context.severity}
                     </div>
                   )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </main>
    </LeafyGreenProvider>
  );
}
