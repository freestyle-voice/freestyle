/** Generate a unique ID — uses `crypto.randomUUID` when available. */
export function uid(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

/** UI-side mirror of the server config types (kept in sync with src/config.ts). */

export interface McpServerConfig {
  id: string;
  name: string;
  transport: "stdio" | "http";
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
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

/** Emitted when a tool finishes executing. */
export interface ToolCallEvent {
  type: "toolCall";
  callId: string;
  tool: string;
  input: Record<string, unknown>;
  output: string;
  isError?: boolean;
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

export interface ConversationEntry {
  role: "user" | "assistant";
  content: string;
}

export interface SavedConversation {
  id: string;
  title: string;
  createdAt: number;
  messages: ConversationEntry[];
}
