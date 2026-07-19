/** Generate a unique ID — uses `crypto.randomUUID` when available. */
export function uid(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

/** Strip the `serverId__` prefix from namespaced MCP tool names. */
export function displayToolName(name: string): string {
  const i = name.indexOf("__");
  return i >= 0 ? name.slice(i + 2) : name;
}

/** UI-side mirror of the server config types (kept in sync with src/config.ts). */

export type McpAuthMode = "none" | "headers" | "oauth";

export interface McpServerConfig {
  id: string;
  name: string;
  transport: "stdio" | "http";
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  auth?: McpAuthMode;
  headers?: Record<string, string>;
  enabled: boolean;
  builtin?: boolean;
}

export interface Skill {
  id: string;
  name: string;
  instructions: string;
  enabled: boolean;
}

export interface ToolGroupMeta {
  id: string;
  label: string;
  description: string;
  tools: string[];
}

/**
 * Built-in tool groups — must stay in sync with `TOOL_GROUPS` in
 * `src/config.ts`. Defined here so all UI components share a single source.
 */
export const TOOL_GROUPS: ToolGroupMeta[] = [
  {
    id: "filesystem",
    label: "File System",
    description: "read_file, write_file, list_directory, search_files",
    tools: ["read_file", "write_file", "list_directory", "search_files"],
  },
  {
    id: "shell",
    label: "Shell",
    description: "run_command",
    tools: ["run_command"],
  },
  {
    id: "clipboard",
    label: "Clipboard & Apps",
    description:
      "get_clipboard, set_clipboard, open_url, get_frontmost_app, paste_text",
    tools: [
      "get_clipboard",
      "set_clipboard",
      "open_url",
      "get_frontmost_app",
      "paste_text",
    ],
  },
  {
    id: "screenshots",
    label: "Screenshots",
    description: "take_screenshot",
    tools: ["take_screenshot"],
  },
  {
    id: "shortcuts",
    label: "Shortcuts",
    description: "run_shortcut (macOS only)",
    tools: ["run_shortcut"],
  },
  {
    id: "desktop",
    label: "Desktop Control",
    description:
      "left_click, right_click, double_click, move_cursor, type_text, press_key",
    tools: [
      "left_click",
      "right_click",
      "double_click",
      "move_cursor",
      "type_text",
      "press_key",
    ],
  },
];

/** Default: all groups enabled except desktop (opt-in). */
export const DEFAULT_TOOL_GROUPS: Record<string, boolean> = {
  filesystem: true,
  shell: true,
  clipboard: true,
  screenshots: true,
  shortcuts: true,
  desktop: false,
};

/** Default system prompt — kept in sync with `DEFAULT_SYSTEM_PROMPT` in src/config.ts. */
export const DEFAULT_SYSTEM_PROMPT =
  "You are a helpful voice assistant. Keep replies concise and conversational " +
  "since they're read aloud in a small panel. Use the tools available to you " +
  "when they help answer the request.\n\n" +
  "Format your replies with Markdown — the panel renders it. When presenting " +
  "several items that share the same fields (products, prices, options, " +
  "comparisons, etc.), use a Markdown table so the data points are easy to " +
  "scan. Use bullet lists for simple enumerations, **bold** for key values, " +
  "and `code` for identifiers or commands. Keep tables compact.";

export type ComputerUseMode = "full" | "guided";

export interface AgentConfig {
  systemPrompt: string;
  agentName: string;
  mcpServers: McpServerConfig[];
  skills: Skill[];
  builtinToolsEnabled: boolean;
  builtinToolGroups: Record<string, boolean>;
  computerUseMode: ComputerUseMode;
}

/** Emitted when a tool starts executing (no output yet). */
export interface ToolCallStartEvent {
  type: "toolCallStart";
  callId: string;
  tool: string;
  input: Record<string, unknown>;
}

/** An MCP UI resource (MCP Apps / mcp-ui) for rendering an interactive widget. */
export interface UiResource {
  uri: string;
  mimeType: string;
  text?: string;
  blob?: string;
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

/** A completed tool invocation stored with its assistant message. */
export interface StoredToolCall {
  callId: string;
  tool: string;
  input: Record<string, unknown>;
  output: string;
  isError?: boolean;
  uiResource?: UiResource;
}

/** A run of assistant text between tool calls. */
export interface TextPart {
  type: "text";
  text: string;
}

/** A tool invocation rendered inline at the point it happened. */
export interface ToolPart {
  type: "tool";
  tool: StoredToolCall;
}

/** An ordered piece of an assistant turn — text or a tool call. */
export type AssistantPart = TextPart | ToolPart;

export interface ConversationEntry {
  role: "user" | "assistant";
  content: string;
  toolCalls?: StoredToolCall[];
  /**
   * Ordered text/tool parts preserving the real interleaving. When absent
   * (older saved conversations), renderers fall back to `content`+`toolCalls`.
   */
  parts?: AssistantPart[];
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
