import { StateGraph } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import {
  ChatPromptTemplate,
  MessagesPlaceholder,
} from "@langchain/core/prompts";
import { createBedrockClient } from "../../integrations/bedrock/chat.js";
import getMongoClientPromise from "../../integrations/mongodb/client.js";
import { StateAnnotation } from "./state.js";
import { getTools } from "./tools.js";
import { MongoDBSaver } from "@langchain/langgraph-checkpoint-mongodb";
import { AuditLogger } from "../../infrastructure/logging/auditLogger.js";

const tools = getTools();

const prompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    `You are the Planning agent. 
    You receive a workorder, retrieve additional context, and schedule the workorder execution.
    No need to add details in the final response, after the work order is scheduled, just acknowledge the completion.
    Use your tools as needed. 
    Current time: {time}.`,
  ],
  new MessagesPlaceholder("messages"),
]);

function parseAlertFromMessages(messages = []) {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const content = messages[i]?.content;
    if (typeof content !== "string") continue;
    const start = content.indexOf("{");
    const end = content.lastIndexOf("}");
    if (start < 0 || end < 0 || end <= start) continue;
    try {
      const payload = JSON.parse(content.slice(start, end + 1));
      if (payload && (payload._id || payload.alert_id || payload.machine_id)) {
        return payload;
      }
    } catch {
      // Continue scan.
    }
  }
  return null;
}

// writeAuditTraceFireAndForget removed in favor of AuditLogger

export async function callModel(state) {
  const model = createBedrockClient();
  const bindedModel = model.bindTools(tools);
  const alert = parseAlertFromMessages(state.messages || []);
  const formattedPrompt = await prompt.formatMessages({
    time: new Date().toISOString(),
    messages: state.messages,
  });
  const result = await bindedModel.invoke(formattedPrompt);
  const hasPendingToolCalls =
    Array.isArray(result.tool_calls) && result.tool_calls.length > 0;
  if (!hasPendingToolCalls) {
    AuditLogger.logDecision({
      alertId: alert?.alert_id || alert?._id || null,
      agentName: "planning",
      reasoningText: "Planning agent set a production-aware maintenance schedule using staff and inventory constraints.",
      decision: "schedule_set",
      context: {
        confidence_score: 0.9,
        patterns: state.crossMachinePatternsFound || [],
        digital_twin: state.digitalTwinContext || {},
      }
    }).catch(console.error);
  }
  // Reset messages to only the model's response (like test agent)
  return { messages: [result] };
}

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
    .addNode("tools", new ToolNode(tools))
    .addEdge("__start__", "agent")
    .addConditionalEdges("agent", shouldContinue)
    .addEdge("tools", "agent");

  let checkpointer = null;
  if (client && dbName) {
    checkpointer = new MongoDBSaver({ client, dbName });
  }

  const graph = builder.compile({ checkpointer });
  graph.name = "Planning Agent";
  return graph;
}
