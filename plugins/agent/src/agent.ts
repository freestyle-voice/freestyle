import {
  generateText,
  type LanguageModel,
  type ModelMessage,
  stepCountIs,
} from "ai";
import type { PluginLlm } from "freestyle-voice";
import {
  type AgentConfig,
  buildSystemPrompt,
  type ConversationEntry,
} from "./config.js";
import { closeConnections, connectEnabledServers } from "./mcp.js";

/** Max tool-calling steps in a single agent turn. */
const MAX_STEPS = 8;

/**
 * Run one agent turn: connect the configured MCP servers, hand their tools to
 * the model along with the conversation, run the tool-calling loop, and return
 * the assistant's reply. MCP connections are always closed afterward.
 */
export async function runAgentTurn(opts: {
  llm: PluginLlm;
  config: AgentConfig;
  history: ConversationEntry[];
  signal?: AbortSignal;
  log: (msg: string) => void;
}): Promise<string> {
  const { llm, config, history, signal, log } = opts;

  const { tools, connections } = await connectEnabledServers(
    config.mcpServers,
    log,
  );

  try {
    const messages: ModelMessage[] = history.map((e) => ({
      role: e.role,
      content: e.content,
    }));

    const result = await generateText({
      model: llm.getModel() as LanguageModel,
      system: buildSystemPrompt(config),
      messages,
      tools,
      stopWhen: stepCountIs(MAX_STEPS),
      ...(signal ? { abortSignal: signal } : {}),
    });

    return (
      result.text.trim() || "I ran the requested tools but have nothing to add."
    );
  } finally {
    await closeConnections(connections);
  }
}
