# Feature 1: Digital Twin Simulation Agent

## What was added

- A new supervisor graph node `digitalTwin` implemented in `src/agents/supervisor/digitalTwinAgent.js`.
- Supervisor state now tracks:
  - `digitalTwinContext`
  - `alertSuppressed`
- Supervisor routing now enforces alert workflow order:
  - `digitalTwin -> failure -> workorder -> planning`
  - if `alertSuppressed === true`, the workflow ends before failure analysis.
- Simulation outputs are persisted in `digital_twin_simulations`.

## MongoDB collections used

- `telemetry` (time-series source for last 24h readings)
- `machine_topology` (downstream machine dependencies)
- `digital_twin_simulations` (persisted outputs)

## Simulation behavior

1. Parse incoming alert payload and identify `machine_id`.
2. Fetch last 24h telemetry for that machine from `telemetry`.
3. Estimate TTF (in hours) from observed degradation trend.
4. Read downstream dependencies from `machine_topology`.
5. Compute `cascade_risk_score` (0-100).
6. Suppress alert when risk is below 20.
7. Persist result with timestamp in `digital_twin_simulations`.

## How to test

1. Ensure local app is running:
   - `npm run dev`
2. Seed topology sample data (example in Mongo shell):
   - Insert one topology document:
     - `machine_id: "M1"`
     - `downstream_machines: ["M2", "M3"]`
3. Generate telemetry:
   - Open the Failure Prediction page and run simulation for a few minutes.
4. Trigger an alert:
   - Raise temperature or vibration above thresholds.
5. Run Supervisor Agent:
   - In Agent Sandbox, choose `Supervisor Agent`.
   - Send alert payload message (JSON).
6. Verify persistence in MongoDB:
   - Query `digital_twin_simulations`.
   - Confirm fields: `timestamp`, `machine_id`, `ttf_hours`, `cascade_risk_score`, `affected_machines`, `suppressed`.
7. Verify suppression logic:
   - Use no downstream machines in `machine_topology` and re-run.
   - Confirm `cascade_risk_score < 20` and no failure-step output follows.

## Notes

- If telemetry history is sparse, the agent uses a safe fallback TTF estimate.
- Machine id normalization is handled for values like `M1` and `1`.
