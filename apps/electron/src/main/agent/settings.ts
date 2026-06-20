import { readFileSync } from "node:fs";
import { join } from "node:path";
import { app } from "electron";

export interface AgentSettings {
  agentCwd?: string;
  agentRecentProjects?: string[];
  agentAuthMode?: string;
  agentComputerUse?: boolean;
  agentComputerUseMode?: string;
}

export function readAgentSettings(): AgentSettings {
  try {
    return JSON.parse(
      readFileSync(join(app.getPath("userData"), "settings.json"), "utf-8"),
    ) as AgentSettings;
  } catch {
    return {};
  }
}
