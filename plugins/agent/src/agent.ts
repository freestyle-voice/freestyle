import {
  type LanguageModel,
  type ModelMessage,
  stepCountIs,
  streamText,
} from "ai";
import type { PluginLlm } from "freestyle-voice";
import {
  type AgentConfig,
  buildSystemPrompt,
  type ConversationEntry,
} from "./config.js";
import { getBuiltinTools } from "./mcp/index.js";
import { closeConnections, connectEnabledServers } from "./mcp.js";

/** Max tool-calling steps in a single agent turn. */
const MAX_STEPS = 8;

/**
 * Run one agent turn: connect the configured MCP servers, hand their tools to
 * the model along with the conversation, and stream the reply. `onDelta` fires
 * for each text chunk as it generates (drives the live pill panel); the full
 * reply is returned once the stream drains. MCP connections are always closed
 * afterward.
 */
export async function runAgentTurn(opts: {
  llm: PluginLlm;
  config: AgentConfig;
  history: ConversationEntry[];
  signal?: AbortSignal;
  log: (msg: string) => void;
  onDelta?: (text: string) => void;
}): Promise<string> {
  const { llm, config, history, signal, log, onDelta } = opts;

  const { tools: externalTools, connections } = await connectEnabledServers(
    config.mcpServers,
    log,
  );

  // Merge built-in tools (if enabled) with external MCP tools.
  // Built-in tools are added first so external servers can override them.
  const builtinTools = config.builtinToolsEnabled
    ? getBuiltinTools(config.builtinToolGroups)
    : {};
  const tools = { ...builtinTools, ...externalTools };

  try {
    const messages: ModelMessage[] = history.map((e) => ({
      role: e.role,
      content: e.content,
    }));

    const result = streamText({
      model: llm.getModel() as LanguageModel,
      system: buildSystemPrompt(config),
      messages,
      tools,
      stopWhen: stepCountIs(MAX_STEPS),
      ...(signal ? { abortSignal: signal } : {}),
    });

    let full = "";
    for await (const delta of result.textStream) {
      full += delta;
      onDelta?.(delta);
    }

    return full.trim() || "I ran the requested tools but have nothing to add.";
  } finally {
    await closeConnections(connections);
  }
}
