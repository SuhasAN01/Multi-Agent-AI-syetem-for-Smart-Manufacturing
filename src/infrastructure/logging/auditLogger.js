import getMongoClientPromise from "../../integrations/mongodb/client.js";
import { env } from "../../../src/config/env.js";

/**
 * Centralized AuditLogger for XAI capabilities.
 * All DB writes are caught to ensure agents do not block/fail on non-critical audit execution.
 */
export class AuditLogger {
  /**
   * @param {Object} params
   * @param {string|null} params.alertId
   * @param {string} params.agentName
   * @param {string} params.reasoningText
   * @param {string} params.decision
   * @param {Object} [params.context={}] Optional additional context (patterns, twin context, etc)
   */
  static async logDecision({ alertId, agentName, reasoningText, decision, context = {} }) {
    try {
      const client = await getMongoClientPromise();
      const db = client.db(env.DATABASE_NAME);
      
      const traceDoc = {
        alert_id: alertId || null,
        agent_name: agentName,
        timestamp: new Date(),
        reasoning_text: reasoningText,
        decision: decision,
        confidence_score: context.confidence_score || 0.9,
        cross_machine_patterns_matched: context.patterns || [],
        digital_twin_context: context.digital_twin || {},
      };

      await db.collection("agent_audit_traces").insertOne(traceDoc);
    } catch (error) {
      // Do NOT re-throw. We want agents to be resilient.
      console.warn(`[AuditLogger] Failed to save trace for ${agentName}:`, error?.message || error);
    }
  }
}
