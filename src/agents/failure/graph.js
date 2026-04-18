import { StateGraph } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import {
  ChatPromptTemplate,
  MessagesPlaceholder,
} from "@langchain/core/prompts";
import { SystemMessage } from "@langchain/core/messages";
import { MongoDBSaver } from "@langchain/langgraph-checkpoint-mongodb";
import { createBedrockClient } from "../../integrations/bedrock/chat.js";
import { generateEmbedding } from "../../integrations/bedrock/embeddings.js";
import getMongoClientPromise from "../../integrations/mongodb/client.js";
import { StateAnnotation } from "./state.js";
import { getTools } from "./tools.js";
import { AuditLogger } from "../../infrastructure/logging/auditLogger.js";

// Get available tools
const tools = getTools();

/**
 * Create a tool node for handling tool calls
 */
const toolNode = new ToolNode(tools);

function parseAlertFromMessages(messages = []) {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const content = messages[i]?.content;
    if (typeof content !== "string") continue;
    const start = content.indexOf("{");
    const end = content.lastIndexOf("}");
    if (start < 0 || end < 0 || end <= start) continue;
    try {
      const payload = JSON.parse(content.slice(start, end + 1));
      if (payload && (payload.machine_id || payload.err_name || payload.details)) {
        return payload;
      }
    } catch {
      // Continue scanning previous messages.
    }
  }
  return null;
}

function buildAlertContext(alert) {
  if (!alert) return "";
  return [
    alert.err_name || "",
    alert.err_code || "",
    alert.machine_id || "",
    alert.details ? JSON.stringify(alert.details) : "",
    alert.description || "",
  ]
    .filter(Boolean)
    .join(" | ");
}

async function getCrossMachinePatternMatches(alertContext) {
  if (!alertContext) return [];
  const queryVector = await generateEmbedding(alertContext);
  const client = await getMongoClientPromise();
  const dbName = process.env.DATABASE_NAME;
  if (!dbName) {
    throw new Error("DATABASE_NAME environment variable is required but not set");
  }
  const db = client.db(dbName);
  const matches = await db
    .collection("historical_failure_patterns")
    .aggregate([
      {
        $vectorSearch: {
          index: "failure_pattern_vector_index",
          path: "embedding",
          queryVector,
          numCandidates: 60,
          limit: 3,
        },
      },
      {
        $project: {
          _id: 0,
          pattern_id: 1,
          description: 1,
          trigger_signal: 1,
          trigger_machine_type: 1,
          affected_machine_type: 1,
          lag_hours: 1,
          historical_occurrences: 1,
          score: { $meta: "vectorSearchScore" },
        },
      },
    ])
    .toArray();
  return matches
    .filter((item) => Number(item.score) > 0.75)
    .sort((a, b) => Number(b.score) - Number(a.score));
}

function buildCrossMachineContextBlock(matches) {
  if (!Array.isArray(matches) || matches.length === 0) return "";
  const sections = matches.map(
    (match) => `Cross-machine failure pattern detected:
Pattern: ${match.description}
Trigger signal: ${match.trigger_signal} on ${match.trigger_machine_type}
Affected machine type: ${match.affected_machine_type}
Typical lag before failure: ${match.lag_hours}h
Historical occurrences: ${match.historical_occurrences}
Confidence: ${Number(match.score).toFixed(3)}`
  );
  return sections.join("\n\n");
}

// writeAuditTrace and writeAuditTraceFireAndForget removed in favor of AuditLogger

/**
 * Define the function that calls the model
 * @param {Object} state - Current graph state
 * @param {Object} config - Configuration options
 * @returns {Object} Updated state with AI message
 */
export async function callModel(state, config) {
  const model = createBedrockClient();
  const bindedModel = model.bindTools(tools);
  let crossMachinePatternsFound = [];
  const alert = parseAlertFromMessages(state.messages || []);

  // Best-effort enrichment path: failure agent still runs if this fails.
  let enrichedMessages = state.messages;
  try {
    const alertContext = buildAlertContext(alert);
    const matches = await getCrossMachinePatternMatches(alertContext);
    crossMachinePatternsFound = matches.map((match) => ({
      pattern_id: match.pattern_id,
      description: match.description,
      score: Number(match.score),
    }));
    const correlationBlock = buildCrossMachineContextBlock(matches);
    if (correlationBlock) {
      console.log("[FailureAgent] Cross-machine pattern enrichment:\n", correlationBlock);
      enrichedMessages = [
        ...(state.messages || []),
        new SystemMessage(correlationBlock),
      ];
    }
  } catch (correlationError) {
    console.warn(
      "[FailureAgent] Cross-machine correlation lookup failed, continuing normally:",
      correlationError?.message || correlationError
    );
  }

  // Create a prompt template for the conversation
  const prompt = ChatPromptTemplate.fromMessages([
    [
      "system",
      `You are the Failure agent. 
      You receive alert details, retrieve additional context, and generate an incident report.
      After retrieving your primary RAG context, use any cross-machine pattern context provided in the conversation when relevant.
      No need to add details in the final response, after the incident report is generated, just acknowledge the completion.  
      Use your tools as needed.`,
    ],
    new MessagesPlaceholder("messages"),
  ]);

  // Format the prompt with the current state
  const formattedPrompt = await prompt.formatMessages({
    messages: enrichedMessages,
  });

  try {
    // Call the model with the formatted prompt
    const result = await bindedModel.invoke(formattedPrompt);
    const hasPendingToolCalls =
      Array.isArray(result.tool_calls) && result.tool_calls.length > 0;
    if (!hasPendingToolCalls) {
      AuditLogger.logDecision({
        alertId: alert?._id || null,
        agentName: "failure",
        reasoningText: crossMachinePatternsFound.length > 0
          ? "Failure agent generated incident report with cross-machine correlation context."
          : "Failure agent generated incident report from retrieved maintenance context.",
        decision: "incident_report_generated",
        context: {
          confidence_score: crossMachinePatternsFound.length > 0 ? crossMachinePatternsFound[0]?.score : 0.9,
          patterns: crossMachinePatternsFound,
          digital_twin: state.digitalTwinContext || {},
        }
      }).catch(console.error);
    }

    // Return the model's response to update the state
    return { messages: [result], crossMachinePatternsFound };
  } catch (error) {
    console.error("Error calling model:", error);

    // Return a deterministic fallback so the sandbox never shows an error
    return {
      messages: [
        {
          role: "ai",
          content:
            "Incident Report (Auto-generated):\nThe system detected an anomaly but the AI model is temporarily unavailable.\nBased on available data, preventive maintenance is recommended.\nPlease review sensor readings and schedule inspection.",
        },
      ],
      crossMachinePatternsFound,
    };
  }
}

/**
 * Define the function that determines the next step in the graph
 * @param {Object} state - Current graph state
 * @returns {string} Next node to execute or end
 */
export function shouldContinue(state) {
  const messages = state.messages;
  const lastMessage = messages[messages.length - 1];

  // If the last message has tool calls, route to tools node
  if (lastMessage.tool_calls && lastMessage.tool_calls.length > 0) {
    return "tools";
  }

  // Otherwise, end the graph
  return "__end__";
}

export function createAgentGraph(client, dbName) {
  const builder = new StateGraph(StateAnnotation)
    .addNode("agent", callModel)
    .addNode("tools", toolNode)
    .addEdge("__start__", "agent")
    .addConditionalEdges("agent", shouldContinue)
    .addEdge("tools", "agent");

  let checkpointer = null;
  if (client && dbName) {
    checkpointer = new MongoDBSaver({ client, dbName });
  }

  const graph = builder.compile({ checkpointer });
  graph.name = "Failure Agent";

  return graph;
}
