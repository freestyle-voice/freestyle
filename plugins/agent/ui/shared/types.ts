/** UI-side mirror of the server config types (kept in sync with src/config.ts). */

export interface McpServerConfig {
  id: string;
  name: string;
  transport: "stdio" | "http";
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  enabled: boolean;
  builtin?: boolean;
}

export interface Skill {
  id: string;
  name: string;
  instructions: string;
  enabled: boolean;
}

export interface AgentConfig {
  systemPrompt: string;
  agentName: string;
  mcpServers: McpServerConfig[];
  skills: Skill[];
  builtinToolsEnabled: boolean;
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
