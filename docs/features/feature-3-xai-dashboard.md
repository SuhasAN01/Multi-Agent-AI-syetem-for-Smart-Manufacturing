# Feature 3: XAI Explainability Dashboard

## Audit trace writes by agent

All relevant agents now write audit traces to `agent_audit_traces` using a consistent schema:

```json
{
  "alert_id": "string",
  "agent_name": "digitalTwin | failure | workOrder | planning | procurement",
  "timestamp": "ISODate",
  "reasoning_text": "plain english summary",
  "decision": "alert_suppressed | incident_report_generated | work_order_drafted | schedule_set",
  "confidence_score": 0.9,
  "cross_machine_patterns_matched": [],
  "digital_twin_context": {}
}
```

Updated writers:

- `src/agents/supervisor/digitalTwinAgent.js`
- `src/agents/failure/graph.js`
- `src/agents/workorder/graph.js`
- `src/agents/planning/graph.js`

Implementation note:

- All writes are fire-and-forget with error handling (`try/catch`) and never block agent flow.

## Dashboard page

- Route: `/explainability`
- Page title: `Agent Reasoning - XAI Dashboard`
- Displays last 20 alerts with expandable timelines per `alert_id`.
- Each timeline entry shows:
  - agent name
  - timestamp
  - decision
  - confidence badge (green/yellow/red)
  - reasoning block under "Why did the AI do this?"
  - cross-machine pattern chip when available
  - digital twin cascade risk meter when available

## API route

- Route: `/api/explainability`
- File: `src/app/api/explainability/route.ts`
- Queries `agent_audit_traces`, groups by `alert_id`, returns latest 20 unique alerts and all associated traces.
- Empty/missing collection is handled gracefully by returning `alerts: []`.

## Navigation

- Added nav link: `XAI Dashboard` -> `/explainability`

## Screenshot placeholder

> Add screenshot here after running a full alert workflow:
>
> - Home -> Failure Prediction -> trigger alert
> - Let Failure, Work Order, Planning complete
> - Open `/explainability` and capture expanded timeline view

## Verification steps

1. Start the app:
   - `npm run dev`
2. Trigger a test alert from Failure Prediction flow.
3. Let multi-agent workflow complete.
4. Open `/explainability`.
5. Confirm:
   - alert row appears
   - timeline shows multiple agent entries in chronological order
   - reasoning blocks render in plain English
   - confidence and decision badges are color-coded
   - cross-machine chip appears when Feature 2 matched patterns
   - cascade risk meter appears when digital twin context is present
