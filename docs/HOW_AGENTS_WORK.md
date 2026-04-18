# How Agents Work — SentinelMind AI Predictive Maintenance

## Full Agent Flow

```
[IoT Telemetry / Alert]
        │
        ▼
┌─────────────────────┐
│   Supervisor Node    │◄──── General questions answered directly by LLM
│   (Orchestrator)     │
└────────┬────────────┘
         │ alert detected
         ▼
┌─────────────────────┐
│  Digital Twin Agent  │──── risk < 20 ──►  [SUPPRESSED — END]
│  (Feature 1)         │
└────────┬────────────┘
         │ risk ≥ 20
         ▼
┌─────────────────────┐
│   Failure Agent      │◄── Atlas Vector Search:
│  (Features 1+2)      │      • Maintenance manuals
│                      │      • Past work orders
│                      │      • Technician interviews
│                      │      • Cross-machine failure patterns (Feature 2)
└────────┬────────────┘
         │ incident report created
         ▼
┌─────────────────────┐
│  Work Order Agent    │◄── Previous work orders (vector search)
└────────┬────────────┘
         │ work order drafted
         ▼
┌─────────────────────┐
│   Planning Agent     │◄── Production calendar, staff shifts, inventory
└────────┬────────────┘
         │ schedule set
         ▼
[COMPLETED — audit traces written to agent_audit_traces]
         │
         ▼
┌─────────────────────┐
│   XAI Dashboard      │  reads agent_audit_traces
│   (Feature 3)        │  renders agent timeline with reasoning
└─────────────────────┘
```

---

## 1. Alert Entry — How Alerts Enter the System

**File:** `src/app/failure-prediction/hooks.js` → `src/app/api/chat/route.js` → `src/agents/callAgent.js`

**Role in System:** The UI sends a structured alert JSON to the `/api/chat` endpoint, which invokes the supervisor agent graph.

### What triggers the flow
The user clicks on a machine alert in the Failure Prediction page. The UI constructs a message like:
```
New alert received: {"machine_id": "M101", "err_name": "Bearing Overheat", "err_code": "E-201", ...}
```
This message is POSTed to `/api/chat` with `agentId: "supervisor"`.

### Step-by-step behavior
1. `POST /api/chat` receives the message and agentId
2. `callAgent()` resolves the agent graph from `config.js`
3. The supervisor graph is compiled (with MongoDBSaver checkpointer)
4. The alert message is wrapped as a `HumanMessage` and passed to `graph.invoke()`
5. The supervisor graph processes the alert through its pipeline

---

## 2. Digital Twin Simulation Agent (Feature 1)

**File:** `src/agents/supervisor/digitalTwinAgent.js`
**Role in System:** Simulates machine degradation, calculates time-to-failure (TTF) and cascade risk, and decides whether to suppress low-priority alerts before they reach the failure agent.

### What triggers this agent
The supervisor node routes here when it detects an alert message (containing "New alert received") and `lastAgent` is null (first step in the workflow).

### Step-by-step behavior
1. **Parse alert** — Scans messages backwards for a JSON object containing `machine_id`
2. **Normalize machine IDs** — Generates variants (e.g., "M101" → ["M101", "101"])
3. **Fetch telemetry** — Reads last 24 hours of sensor data from `telemetry` collection
4. **Calculate TTF** — Uses temperature and vibration degradation rate to estimate hours until failure (clamped 1–168h)
5. **Fetch topology** — Reads `machine_topology` to find downstream machines
6. **Calculate cascade risk** — Combines urgency risk (from TTF) + network risk (from downstream count), score 0-100
7. **Decide suppression** — If `cascadeRiskScore < 20`, alert is suppressed (won't proceed to failure agent)
8. **Write simulation** — Persists result to `digital_twin_simulations` collection (try/catch protected)
9. **Write audit trace** — Fire-and-forget write to `agent_audit_traces`
10. **Return enriched state** — Adds `alertSuppressed`, `digitalTwinContext`, and enrichment message to state

### MongoDB operations

| Operation | Collection | Purpose |
|-----------|------------|---------|
| READ | `telemetry` | Fetch 24h sensor readings for the alerting machine |
| READ | `machine_topology` | Find downstream machines for cascade risk |
| WRITE | `digital_twin_simulations` | Persist simulation result (TTF, risk, affected machines) |
| WRITE | `agent_audit_traces` | Audit trail for XAI dashboard |

### LLM interaction
- **None** — This agent is entirely rule-based / computational. No LLM calls.

### What it passes to the next agent
| Field | Value |
|-------|-------|
| `alertSuppressed` | `true` if cascade risk < 20, `false` otherwise |
| `digitalTwinContext` | `{ ttf_hours, cascade_risk_score, affected_machines, source_alert_id }` |
| `lastAgent` | `"digitalTwin"` |
| `messages` | Original messages + system message with enrichment summary |

### Failure behavior
- **MongoDB down:** Simulation write fails silently (logged), agent still returns enrichment data. Audit trace also fails silently.
- **No telemetry data:** TTF defaults to 72 hours
- **No topology data:** Cascade risk score = 0, affected machines = []

---

## 3. Failure Agent with Cross-Machine Correlation (Features 1+2)

**File:** `src/agents/failure/graph.js`
**Role in System:** Generates structured incident reports by combining RAG context (manuals, past work orders, interviews) with cross-machine failure pattern correlation from Atlas Vector Search.

### What triggers this agent
The supervisor routes here when `lastAgent === "digitalTwin"` and the alert was NOT suppressed.

### Step-by-step behavior
1. **Parse alert context** — Extracts alert fields (err_name, err_code, machine_id, details)
2. **Cross-machine correlation (Feature 2):**
   - Builds a text context string from alert fields
   - Generates an embedding via Bedrock (Cohere embed-english-v3)
   - Runs `$vectorSearch` against `historical_failure_patterns` collection
   - Filters results with score > 0.75
   - Injects matching patterns as a `SystemMessage` into the conversation
3. **LLM RAG loop** — The LLM:
   - Calls `retrieve_manual` tool (vector search on manuals)
   - Calls `retrieve_work_orders` tool (vector search on past work orders)
   - Calls `retrieve_interviews` tool (vector search on interviews)
   - Calls `generate_incident_report` tool to write a structured report
4. **Write audit trace** — Fire-and-forget write with cross-machine pattern data
5. **Return results** — Returns messages and `crossMachinePatternsFound`

### MongoDB operations

| Operation | Collection | Purpose |
|-----------|------------|---------|
| READ (vector search) | `historical_failure_patterns` | Cross-machine correlation (Feature 2) |
| READ (vector search) | `manuals` | RAG: retrieve relevant maintenance manuals |
| READ (vector search) | `workorders` | RAG: retrieve similar past work orders |
| READ (vector search) | `interviews` | RAG: retrieve technician interview context |
| WRITE | `incident_reports` | Persist the generated incident report |
| WRITE | `agent_audit_traces` | Audit trail for XAI dashboard |

### LLM interaction
- **Model:** Bedrock (configured via `COMPLETION_MODEL` env var, default: Claude Haiku)
- **Prompt summary:** "You are the Failure agent. Receive alert details, retrieve additional context, and generate an incident report. Use cross-machine pattern context when relevant."
- **Output format:** Structured incident report via tool call (error_code, error_name, root_cause, repair_instructions, machine_id)

### What it passes to the next agent
| Field | Value |
|-------|-------|
| `crossMachinePatternsFound` | Array of `{ pattern_id, description, score }` from vector search |
| `messages` | Updated with incident report completion message |

### Failure behavior
- **Vector search fails:** Cross-machine correlation skipped (logged), agent continues with standard RAG
- **LLM fails:** Returns fallback "I apologize..." message
- **MongoDB down:** Incident report write fails (tool throws), LLM receives error and may retry

---

## 4. Work Order Agent

**File:** `src/agents/workorder/graph.js`
**Role in System:** Receives the incident report from the failure agent, retrieves similar past work orders via vector search, and generates a new maintenance work order.

### What triggers this agent
The supervisor routes here when `lastAgent === "failure"`.

### Step-by-step behavior
1. **Parse alert from messages** — Extracts alert/incident data from conversation
2. **LLM RAG loop:**
   - Calls `retrieve_work_orders` tool (vector search on past work orders)
   - Calls `generate_work_order` tool to create a structured work order
3. **generate_work_order** tool:
   - Generates embedding for the work order text
   - Sets `proposed_start_time` to current date + 2 days
   - Inserts into `workorders` collection with embedding
4. **Write audit trace** — Fire-and-forget with cross-machine patterns + digital twin context
5. **Return** — Returns model response messages

### MongoDB operations

| Operation | Collection | Purpose |
|-----------|------------|---------|
| READ (vector search) | `workorders` | RAG: retrieve similar past work orders |
| WRITE | `workorders` | Persist the generated work order |
| WRITE | `agent_audit_traces` | Audit trail for XAI dashboard |

### LLM interaction
- **Model:** Bedrock Claude Haiku
- **Prompt summary:** "You are the work order agent. Receive an incident report, retrieve additional context, and generate a work order."
- **Output format:** Structured work order via tool call (machine_id, title, estimated_duration_days, required_skills, required_materials, observations)

### What it passes to the next agent
| Field | Value |
|-------|-------|
| `messages` | Updated with work order completion message |
| `lastAgent` | Set to `"workorder"` by supervisor's agentNode wrapper |

### Failure behavior
- **Vector search fails:** Work order tool throws, LLM receives error
- **LLM fails:** No fallback message (callModel has no try/catch at the invoke level — will propagate to supervisor)
- **MongoDB down:** Work order insertion fails, error returned to LLM

---

## 5. Planning Agent

**File:** `src/agents/planning/graph.js`
**Role in System:** Schedules the work order execution considering staff availability, inventory, and the production calendar. Finds optimal time slots that minimize production disruption.

### What triggers this agent
The supervisor routes here when `lastAgent === "workorder"`.

### Step-by-step behavior
1. **Parse alert from messages** — Extracts context
2. **LLM tool-use loop:**
   - Calls `check_inventory_availability` — queries `inventory` collection
   - Calls `check_staff_availability` — queries `maintenance_staff` collection, matches skills
   - Calls `schedule_work_order` — queries `production_calendar`, finds optimal slot, inserts maintenance task
3. **Scheduling logic** (in `src/lib/simulation/planning.js`):
   - Finds production gaps in the next 2 months
   - Applies delay factor for priority ordering
   - Updates affected production tasks
   - Inserts the new maintenance task
4. **Write audit trace** — Fire-and-forget
5. **Return** — Returns model response messages

### MongoDB operations

| Operation | Collection | Purpose |
|-----------|------------|---------|
| READ | `inventory` | Check material availability |
| READ | `maintenance_staff` | Find qualified available staff |
| READ + WRITE | `production_calendar` | Find slots, insert maintenance task, delay affected tasks |
| WRITE | `agent_audit_traces` | Audit trail for XAI dashboard |

### LLM interaction
- **Model:** Bedrock Claude Haiku
- **Prompt summary:** "You are the Planning agent. Receive a workorder, retrieve additional context, and schedule the workorder execution."
- **Output format:** Scheduling confirmation via tool calls

### What it passes to the next agent
| Field | Value |
|-------|-------|
| `messages` | Updated with scheduling completion message |
| `lastAgent` | Set to `"planning"` by supervisor's agentNode wrapper |

After planning completes, the supervisor sees `lastAgent === "planning"` and routes to `__end__`.

### Failure behavior
- **Inventory check fails:** Tool returns error JSON, LLM may skip or retry
- **No production calendar data:** Scheduling tool may return empty result
- **MongoDB down:** Tool throws, error propagated to LLM

---

## 6. XAI Explainability API + Dashboard (Feature 3)

**API File:** `src/app/api/explainability/route.ts`
**UI File:** `src/app/explainability/page.tsx`
**Role in System:** Provides transparency into agent decision-making by aggregating audit traces from all agents and rendering an interactive timeline for each alert.

### What triggers this feature
- **API:** Any GET request to `/api/explainability`
- **UI:** User navigates to `/explainability` page

### Step-by-step behavior — API

1. Connects to MongoDB, accesses `agent_audit_traces` collection
2. Runs an aggregation pipeline:
   - Normalizes null `alert_id` to `"unknown_alert"`
   - Sorts by timestamp descending
   - Groups by `alert_id`, collecting all traces per alert
   - Limits to most recent 20 alerts
3. Post-processes each group:
   - Sorts traces chronologically (oldest first = agent timeline order)
   - Extracts affected machines from digital twin context
   - Determines overall decision from the latest trace
4. Returns `{ alerts: [...] }` JSON response
5. **Error handling:** Returns `{ alerts: [] }` on any error (graceful empty state)

### Step-by-step behavior — UI Dashboard

1. Fetches `/api/explainability` on mount
2. Renders a table with columns: alert_id, machines affected, timestamp, overall decision, status
3. Each row is expandable to show **Agent Timeline**:
   - Each trace shows: agent name, timestamp, decision badge, confidence badge
   - Cross-machine pattern badge (amber) if patterns were matched
   - **Risk Meter** bar for cascade risk score (green/yellow/red)
   - **"Why did the AI do this?"** expandable section showing `reasoning_text`

### MongoDB operations

| Operation | Collection | Purpose |
|-----------|------------|---------|
| READ (aggregation) | `agent_audit_traces` | Fetch all audit traces grouped by alert |

### LLM interaction
- **None** — This is a pure read-and-display feature.

### Audit Trace Document Schema (written by all agents)

```json
{
  "alert_id": "string | null",
  "agent_name": "digitalTwin | failure | workOrder | planning",
  "timestamp": "Date",
  "reasoning_text": "Human-readable explanation of the agent's decision",
  "decision": "alert_suppressed | alert_enriched | incident_report_generated | work_order_drafted | schedule_set",
  "confidence_score": 0.0-1.0,
  "cross_machine_patterns_matched": [
    { "pattern_id": "FP-001", "description": "...", "score": 0.85 }
  ],
  "digital_twin_context": {
    "ttf_hours": 42.5,
    "cascade_risk_score": 67,
    "affected_machines": ["M102", "M103"],
    "source_alert_id": "..."
  }
}
```

### Failure behavior
- **No audit traces yet:** Dashboard shows "No audit traces available yet." (empty state)
- **MongoDB connection fails:** Returns `{ alerts: [] }` with HTTP 200 (graceful degradation)
- **Collection doesn't exist:** Caught specifically ("ns does not exist"), returns empty array
