import type { PluginStorage } from "freestyle-voice";

/** One message in the agent conversation thread. */
export interface ConversationEntry {
  role: "user" | "assistant";
  content: string;
}

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
  enabled: boolean;
}

/** A named, reusable instruction set the agent can apply. */
export interface Skill {
  id: string;
  name: string;
  /** Instructions injected into the system prompt when the skill is enabled. */
  instructions: string;
  enabled: boolean;
}

export interface AgentConfig {
  systemPrompt: string;
  /** Trigger phrase, e.g. "hey freestyle". Matched case-insensitively. */
  wakeWord: string;
  mcpServers: McpServerConfig[];
  skills: Skill[];
}

export const DEFAULT_SYSTEM_PROMPT =
  "You are Freestyle, a helpful voice assistant. Keep replies concise and " +
  "conversational since they're read aloud in a small panel. Use the tools " +
  "available to you when they help answer the request.";

export const DEFAULT_WAKE_WORD = "hey freestyle";

export const DEFAULT_CONFIG: AgentConfig = {
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  wakeWord: DEFAULT_WAKE_WORD,
  mcpServers: [],
  skills: [],
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

  const wakeWord =
    typeof raw.wakeWord === "string" && raw.wakeWord.trim()
      ? raw.wakeWord.trim()
      : DEFAULT_WAKE_WORD;

  const mcpServers = Array.isArray(raw.mcpServers)
    ? raw.mcpServers.filter(isRecord).map(normalizeMcpServer)
    : [];

  const skills = Array.isArray(raw.skills)
    ? raw.skills.filter(isRecord).map(normalizeSkill)
    : [];

  return { systemPrompt, wakeWord, mcpServers, skills };
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
    enabled: raw.enabled !== false,
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

/** Build the full system prompt from the base prompt + enabled skills. */
export function buildSystemPrompt(config: AgentConfig): string {
  const enabledSkills = config.skills.filter(
    (s) => s.enabled && s.instructions.trim(),
  );
  if (enabledSkills.length === 0) return config.systemPrompt;

  const skillBlocks = enabledSkills
    .map((s) => `## Skill: ${s.name}\n${s.instructions.trim()}`)
    .join("\n\n");
  return `${config.systemPrompt}\n\n# Skills\n${skillBlocks}`;
}
