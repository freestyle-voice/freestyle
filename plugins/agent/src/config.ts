import type { PluginStorage } from "freestyle-voice";

/** One message in the agent conversation thread. */
export interface ConversationEntry {
  role: "user" | "assistant";
  content: string;
}

/** Identifier for the built-in Freestyle Tools MCP entry. */
export const BUILTIN_SERVER_ID = "freestyle-tools";

/** A configured MCP server the agent can pull tools from. */
export interface McpServerConfig {
  id: string;
  name: string;
  /** Transport. `stdio` spawns a local command; `http` connects to a URL. */
  transport: "stdio" | "http";
  /** For `stdio`: the executable to spawn (e.g. "npx"). */
  command?: string;
  /** For `stdio`: arguments passed to the command. */
  args?: string[];
  /** For `stdio`: extra environment variables. */
  env?: Record<string, string>;
  /** For `http`: the server URL. */
  url?: string;
  /** For `http`: custom headers (e.g. Authorization). */
  headers?: Record<string, string>;
  enabled: boolean;
  /** True for the built-in Freestyle Tools server. Cannot be deleted in the UI. */
  builtin?: boolean;
}

/** A named, reusable instruction set the agent can apply. */
export interface Skill {
  id: string;
  name: string;
  /** Instructions injected into the system prompt when the skill is enabled. */
  instructions: string;
  enabled: boolean;
}

/**
 * Built-in tool group identifiers. Each controls a cluster of related tools
 * that the user can toggle independently in Settings.
 */
export type BuiltinToolGroup =
  | "filesystem"
  | "shell"
  | "clipboard"
  | "screenshots"
  | "shortcuts"
  | "desktop";

/** Human-readable metadata for each tool group shown in Settings. */
export interface ToolGroupMeta {
  id: BuiltinToolGroup;
  label: string;
  description: string;
  tools: string[];
}

/** All groups in display order — the UI iterates this list. */
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

/** Default: all groups enabled except desktop control (opt-in). */
export const DEFAULT_TOOL_GROUPS: Record<BuiltinToolGroup, boolean> = {
  filesystem: true,
  shell: true,
  clipboard: true,
  screenshots: true,
  shortcuts: true,
  desktop: false,
};

/** How desktop-control tools actuate. */
export type ComputerUseMode = "full" | "guided";

export interface AgentConfig {
  systemPrompt: string;
  /**
   * The agent's name. Doubles as the spoken summon word — saying it at the
   * start of a dictation (e.g. "Freestyle, …" or "Hey Freestyle …") routes the
   * utterance to the agent — and is woven into the system prompt so the model
   * knows what it's called. Matched case-insensitively.
   */
  agentName: string;
  mcpServers: McpServerConfig[];
  skills: Skill[];
  /** Whether the built-in Freestyle Tools are active (default true). */
  builtinToolsEnabled: boolean;
  /** Per-group toggles for built-in tools. Missing keys default to true. */
  builtinToolGroups: Record<string, boolean>;
  /**
   * How desktop-control tools (mouse/keyboard) behave:
   *  - `"full"` — directly controls the cursor and keyboard.
   *  - `"guided"` (default) — shows a ghost-cursor overlay; the user acts.
   */
  computerUseMode: ComputerUseMode;
}

export const DEFAULT_SYSTEM_PROMPT =
  "You are a helpful voice assistant. Keep replies concise and conversational " +
  "since they're read aloud in a small panel. Use the tools available to you " +
  "when they help answer the request.";

export const DEFAULT_AGENT_NAME = "Freestyle";

export const DEFAULT_CONFIG: AgentConfig = {
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  agentName: DEFAULT_AGENT_NAME,
  mcpServers: [],
  skills: [],
  builtinToolsEnabled: true,
  builtinToolGroups: { ...DEFAULT_TOOL_GROUPS },
  computerUseMode: "guided",
};

const CONFIG_KEY = "config";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Coerce untrusted stored/POSTed data into a valid, fully-populated config. */
export function normalizeConfig(raw: unknown): AgentConfig {
  if (!isRecord(raw)) return { ...DEFAULT_CONFIG };

  const systemPrompt =
    typeof raw.systemPrompt === "string" && raw.systemPrompt.trim()
      ? raw.systemPrompt
      : DEFAULT_SYSTEM_PROMPT;

  const agentName =
    typeof raw.agentName === "string" && raw.agentName.trim()
      ? raw.agentName.trim()
      : DEFAULT_AGENT_NAME;

  const mcpServers = Array.isArray(raw.mcpServers)
    ? raw.mcpServers.filter(isRecord).map(normalizeMcpServer)
    : [];

  const skills = Array.isArray(raw.skills)
    ? raw.skills.filter(isRecord).map(normalizeSkill)
    : [];

  const builtinToolsEnabled = raw.builtinToolsEnabled !== false;

  const builtinToolGroups: Record<string, boolean> = {
    ...DEFAULT_TOOL_GROUPS,
  };
  if (isRecord(raw.builtinToolGroups)) {
    for (const [k, v] of Object.entries(raw.builtinToolGroups)) {
      if (typeof v === "boolean") builtinToolGroups[k] = v;
    }
  }

  const computerUseMode: ComputerUseMode =
    raw.computerUseMode === "full" ? "full" : "guided";

  return {
    systemPrompt,
    agentName,
    mcpServers,
    skills,
    builtinToolsEnabled,
    builtinToolGroups,
    computerUseMode,
  };
}

function normalizeMcpServer(raw: Record<string, unknown>): McpServerConfig {
  const transport = raw.transport === "http" ? "http" : "stdio";
  return {
    id: typeof raw.id === "string" && raw.id ? raw.id : crypto.randomUUID(),
    name: typeof raw.name === "string" ? raw.name : "Untitled server",
    transport,
    command: typeof raw.command === "string" ? raw.command : undefined,
    args: Array.isArray(raw.args)
      ? raw.args.filter((a): a is string => typeof a === "string")
      : undefined,
    env: isRecord(raw.env)
      ? Object.fromEntries(
          Object.entries(raw.env).filter(
            (e): e is [string, string] => typeof e[1] === "string",
          ),
        )
      : undefined,
    url: typeof raw.url === "string" ? raw.url : undefined,
    headers: isRecord(raw.headers)
      ? Object.fromEntries(
          Object.entries(raw.headers).filter(
            (e): e is [string, string] => typeof e[1] === "string",
          ),
        )
      : undefined,
    enabled: raw.enabled !== false,
    builtin: raw.builtin === true ? true : undefined,
  };
}

function normalizeSkill(raw: Record<string, unknown>): Skill {
  return {
    id: typeof raw.id === "string" && raw.id ? raw.id : crypto.randomUUID(),
    name: typeof raw.name === "string" ? raw.name : "Untitled skill",
    instructions: typeof raw.instructions === "string" ? raw.instructions : "",
    enabled: raw.enabled !== false,
  };
}

export async function loadConfig(storage: PluginStorage): Promise<AgentConfig> {
  return normalizeConfig(await storage.get(CONFIG_KEY));
}

export async function saveConfig(
  storage: PluginStorage,
  config: AgentConfig,
): Promise<void> {
  await storage.set(CONFIG_KEY, config);
}

/**
 * Build the full system prompt: the agent's name, the base persona prompt, and
 * any enabled skills. The name is prepended so the model consistently refers to
 * itself the way the user summons it.
 */
export function buildSystemPrompt(config: AgentConfig): string {
  const name = config.agentName.trim() || DEFAULT_AGENT_NAME;
  const parts = [`Your name is ${name}.`, config.systemPrompt];

  const enabledSkills = config.skills.filter(
    (s) => s.enabled && s.instructions.trim(),
  );
  if (enabledSkills.length > 0) {
    const skillBlocks = enabledSkills
      .map((s) => `## Skill: ${s.name}\n${s.instructions.trim()}`)
      .join("\n\n");
    parts.push(`# Skills\n${skillBlocks}`);
  }

  return parts.join("\n\n");
}
