# Feature 2: Cross-Machine Failure Correlation

## `historical_failure_patterns` collection schema

```json
{
  "pattern_id": "string",
  "description": "string",
  "trigger_machine_type": "string",
  "affected_machine_type": "string",
  "trigger_signal": "string",
  "lag_hours": 72,
  "historical_occurrences": 10,
  "severity": "low | medium | high",
  "embedding": [0.123, 0.456]
}
```

## Seed script

- Script path: `scripts/seedFailurePatterns.js`
- Adds 10 realistic cross-machine failure patterns.
- Generates Cohere embeddings via existing utility: `generateEmbedding`.
- Upserts by `pattern_id` into `historical_failure_patterns`.
- Tries to create vector search index `failure_pattern_vector_index`.

Run:

```bash
npm run seed_failure_patterns
```

## Failure Agent enrichment behavior

- The Failure Agent now runs a second vector search against `historical_failure_patterns`.
- Query vector is generated from current alert context using the existing embedding utility.
- Retrieves top 3 pattern matches and filters `score > 0.75`.
- If matches exist, appends this context block to prompt history:
  - Pattern
  - Trigger signal + trigger machine type
  - Affected machine type
  - Lag hours
  - Historical occurrences
  - Confidence score
- If no matches (or lookup fails), agent continues silently with normal behavior.

## Audit trace behavior

When pattern matches are found, Failure Agent writes a document to `agent_audit_traces` including:

- `alert_id`
- `agent_name: "failure"`
- `timestamp`
- `reasoning_text`
- `decision`
- `confidence_score`
- `cross_machine_patterns_matched: [{ pattern_id, description, score }]`

## How to verify

1. Seed patterns:
   - `npm run seed_failure_patterns`
2. Trigger failure flow with an alert in the app.
3. Watch server logs for:
   - `[FailureAgent] Cross-machine pattern enrichment:`
4. Confirm at least one prompt enrichment block appears when a score is above 0.75.
5. Verify state passthrough in supervisor state:
   - `crossMachinePatternsFound` should contain simplified match objects.
6. Verify MongoDB:
   - `historical_failure_patterns` contains seeded docs with embeddings.
   - `agent_audit_traces` has entries with `cross_machine_patterns_matched` when matches occur.

## Manual Atlas Search index creation (if auto-create fails)

Create a Search index named `failure_pattern_vector_index` on `historical_failure_patterns`:

```json
{
  "fields": [
    {
      "type": "vector",
      "path": "embedding",
      "numDimensions": 1024,
      "similarity": "cosine"
    }
  ]
}
```
