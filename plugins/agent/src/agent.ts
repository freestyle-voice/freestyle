import {
  type LanguageModel,
  type ModelMessage,
  stepCountIs,
  streamText,
} from "ai";
import type { PluginLlm, PluginStorage } from "freestyle-voice";
import {
  type AgentConfig,
  buildSystemPrompt,
  type ConversationEntry,
} from "./config.js";
import {
  clearGuidance,
  getBuiltinTools,
  type ToolCallEvent,
  type ToolCallStartEvent,
} from "./mcp/index.js";
import type { GuidanceEvent } from "./mcp/tools/desktop.js";
import { closeConnections, connectEnabledServers } from "./mcp.js";

/** Max tool-calling steps in a single agent turn. */
const MAX_STEPS = 8;

/**
 * Extract human-readable text from a tool result. MCP tools return content
 * arrays like `[{type:"text", text:"..."}]`. Built-in tools return plain
 * strings. This normalizes both to a displayable string.
 */
function extractToolOutput(output: unknown): string {
  if (typeof output === "string") return output;
  if (Array.isArray(output)) {
    const texts: string[] = [];
    for (const part of output) {
      if (typeof part === "object" && part !== null) {
        const p = part as Record<string, unknown>;
        if (p.type === "text" && typeof p.text === "string") {
          texts.push(p.text);
        } else if (p.type === "image") {
          texts.push("[image]");
        } else if (p.type === "resource") {
          texts.push(`[resource: ${(p as Record<string, unknown>).uri ?? ""}]`);
        }
      }
    }
    if (texts.length > 0) return texts.join("\n");
  }
  return JSON.stringify(output ?? "");
}

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
  onToolCallStart?: (e: ToolCallStartEvent) => void;
  onToolCall?: (e: ToolCallEvent) => void;
  onGuidance?: (e: GuidanceEvent) => void;
  storage?: PluginStorage;
  pluginSlug?: string;
}): Promise<string> {
  const {
    llm,
    config,
    history,
    signal,
    log,
    onDelta,
    onToolCallStart,
    onToolCall,
    onGuidance,
    storage,
    pluginSlug,
  } = opts;

  const { tools: externalTools, connections } = await connectEnabledServers(
    config.mcpServers,
    log,
    { storage, pluginSlug },
  );

  // Determine if desktop-control tools should be active.
  const desktopEnabled =
    config.builtinToolsEnabled && config.builtinToolGroups.desktop !== false;

  // Merge built-in tools (if enabled) with external MCP tools.
  // Built-in tools are added first so external servers can override them.
  const builtinTools = config.builtinToolsEnabled
    ? getBuiltinTools(config.builtinToolGroups, {
        computerUseMode: desktopEnabled ? config.computerUseMode : undefined,
        onGuidance,
        onToolCall,
      })
    : {};
  const tools = { ...builtinTools, ...externalTools };

  try {
    const messages: ModelMessage[] = history.map((e) => ({
      role: e.role,
      content: e.content,
    }));

    // Append computer-use instructions to the system prompt when desktop is active.
    let system = buildSystemPrompt(config);
    if (desktopEnabled) {
      const base =
        "ALWAYS call `take_screenshot` first to see the screen before acting. Click/move coordinates are in the pixel space of the most recent screenshot (logical screen points, top-left origin).";
      if (config.computerUseMode === "guided") {
        system += `\n\n# Desktop Control (Guided Mode)\nYou are in GUIDED (teaching) mode. You do NOT control the mouse or keyboard — each tool call instead shows the user a ghost-cursor hint and a caption, and the USER performs the step. ${base} For every action, pass a short \`note\` describing what to do and why (it's shown to the user). Work ONE small step at a time, and after each step take a fresh screenshot to confirm the user completed it before continuing — never assume an action happened.`;
      } else {
        system += `\n\n# Desktop Control\nControl the user's desktop directly. ${base} These actions affect the real machine — be deliberate and verify with a fresh screenshot after each step.`;
      }
    }

    const result = streamText({
      model: llm.getModel() as LanguageModel,
      system,
      messages,
      tools,
      stopWhen: stepCountIs(MAX_STEPS),
      ...(signal ? { abortSignal: signal } : {}),
      experimental_onToolCallStart: (event) => {
        onToolCallStart?.({
          callId: event.toolCall.toolCallId,
          tool: event.toolCall.toolName,
          input: (event.toolCall.input ?? {}) as Record<string, unknown>,
        });
      },
      onStepFinish: (step) => {
        if (!onToolCall) return;
        for (const tc of step.toolCalls) {
          const toolResult = step.toolResults.find(
            (r) => r.toolCallId === tc.toolCallId,
          );
          onToolCall({
            callId: tc.toolCallId,
            tool: tc.toolName,
            input: (tc.input ?? {}) as Record<string, unknown>,
            output: extractToolOutput(toolResult?.output),
            isError: false,
          });
        }
      },
    });

    let full = "";
    for await (const delta of result.textStream) {
      full += delta;
      onDelta?.(delta);
    }

    return full.trim() || "I ran the requested tools but have nothing to add.";
  } finally {
    clearGuidance(onGuidance);
    await closeConnections(connections);
  }
}
