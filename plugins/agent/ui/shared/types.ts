import type {
  AssistantPart,
  ConversationEntry,
  UiResource,
} from "../../src/config";

/**
 * Config types and constants come from the single source of truth in
 * `src/config.ts` (which is browser-safe — its only import is a type-only
 * `PluginStorage`). Re-exporting them here means the UI and the plugin server
 * share one definition and can't drift, while UI code keeps importing from
 * `../shared/types` as before.
 */
export type {
  AgentConfig,
  AssistantPart,
  BuiltinToolGroup,
  ComputerUseMode,
  ConversationEntry,
  McpAuthMode,
  McpServerConfig,
  Skill,
  StoredToolCall,
  TextPart,
  ToolGroupMeta,
  ToolPart,
  UiResource,
} from "../../src/config";
export {
  DEFAULT_SYSTEM_PROMPT,
  DEFAULT_TOOL_GROUPS,
  TOOL_GROUPS,
} from "../../src/config";

/** Generate a unique ID — uses `crypto.randomUUID` when available. */
export function uid(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

/** Strip the `serverId__` prefix from namespaced MCP tool names. */
export function displayToolName(name: string): string {
  const i = name.indexOf("__");
  return i >= 0 ? name.slice(i + 2) : name;
}

/* ---- UI-only event/stream shapes ----
 * These mirror the node-only `src/mcp/index.ts` + server stream types, which
 * pull in `ai`/node dependencies and can't be imported into the browser
 * bundle, so they're defined here. */

/** Emitted when a tool starts executing (no output yet). */
export interface ToolCallStartEvent {
  type: "toolCallStart";
  callId: string;
  tool: string;
  input: Record<string, unknown>;
}

/** Emitted when a tool finishes executing. */
export interface ToolCallEvent {
  type: "toolCall";
  callId: string;
  tool: string;
  input: Record<string, unknown>;
  output: string;
  isError?: boolean;
  uiResource?: UiResource;
}

/** Guidance event for the ghost cursor overlay. */
export interface GuidanceEvent {
  kind:
    | "move"
    | "click"
    | "right_click"
    | "double_click"
    | "type"
    | "key"
    | "clear";
  x?: number;
  y?: number;
  caption?: string;
  text?: string;
}

export interface SavedConversation {
  id: string;
  title: string;
  createdAt: number;
  messages: ConversationEntry[];
}

/**
 * Normalize an assistant entry to ordered parts. Uses `parts` when present;
 * otherwise falls back to the legacy shape (tool calls first, then text) so
 * older saved conversations still render.
 */
export function entryParts(msg: ConversationEntry): AssistantPart[] {
  if (msg.parts && msg.parts.length > 0) return msg.parts;
  const parts: AssistantPart[] = [];
  for (const tool of msg.toolCalls ?? []) parts.push({ type: "tool", tool });
  if (msg.content) parts.push({ type: "text", text: msg.content });
  return parts;
}
