/**
 * Agent IPC surface (Voice OS). Registered once from main/index.ts. Keeps the
 * agent wiring out of the already-large index.ts.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentAuthMode } from "@freestyle/validations";
import { app, ipcMain } from "electron";
import { getPrereqStatus } from "./auth.js";
import {
  computerUseAvailable,
  computerUseEnabled,
  installCliclick,
} from "./computer-use.js";
import { getConversation, listConversations } from "./history.js";
import type { AgentSessionManager } from "./session-manager.js";

interface AgentIpcDeps {
  sessionManager: AgentSessionManager;
  /** Persist the chosen auth mode through main's settings.json writer. */
  persistAuthMode: (mode: AgentAuthMode) => void;
  /** Track whether the bar is "busy" (recording or editing) so main's
   *  cursor-driven auto-collapse waits instead of shrinking mid-action. */
  setComposing: (composing: boolean) => void;
  /** Expand + focus the bar — used to reveal it once a voice transcript lands
   *  (recording itself happens in the slim collapsed pill). */
  revealBar: () => void;
  /** Persist the computer-use opt-in through main's settings.json writer. */
  persistComputerUse: (enabled: boolean) => void;
}

/** cwd for runs + conversation history: configured `agentCwd`, else home. */
function resolveCwd(): string {
  try {
    const settings = JSON.parse(
      readFileSync(join(app.getPath("userData"), "settings.json"), "utf-8"),
    ) as { agentCwd?: unknown };
    if (typeof settings.agentCwd === "string" && settings.agentCwd.trim()) {
      return settings.agentCwd;
    }
  } catch {
    // fall through to home
  }
  return app.getPath("home");
}

let registered = false;

export function registerAgentIpc(deps: AgentIpcDeps): void {
  if (registered) return;
  registered = true;

  ipcMain.handle("agent:prereq-status", () => getPrereqStatus());

  ipcMain.on("agent:set-auth-mode", (_event, mode: unknown) => {
    deps.persistAuthMode(mode === "api-key" ? "api-key" : "subscription");
  });

  ipcMain.handle("agent:start", (_event, payload: unknown) => {
    const obj =
      payload && typeof payload === "object"
        ? (payload as { prompt?: unknown; cwd?: unknown; resume?: unknown })
        : {};
    const prompt = String(obj.prompt ?? "").trim();
    if (!prompt) return { ok: false, error: "Empty prompt" };

    const cwd =
      typeof obj.cwd === "string" && obj.cwd.trim() ? obj.cwd : resolveCwd();
    const resume = typeof obj.resume === "string" ? obj.resume : undefined;

    deps.sessionManager.start({ prompt, cwd, resume });
    return { ok: true };
  });

  ipcMain.on("agent:cancel", () => {
    deps.sessionManager.cancel();
  });

  ipcMain.handle("agent:list-conversations", () =>
    listConversations(resolveCwd()),
  );

  ipcMain.handle("agent:get-conversation", (_event, id: unknown) =>
    typeof id === "string" ? getConversation(id, resolveCwd()) : [],
  );

  ipcMain.on("agent-bar:composing", (_event, composing: unknown) => {
    deps.setComposing(composing === true);
  });

  ipcMain.on("agent-bar:reveal", () => deps.revealBar());

  // ---- Computer use (opt-in, experimental) ----
  ipcMain.handle("agent:computer-use:get", () => computerUseEnabled());

  ipcMain.on("agent:computer-use:set", (_event, enabled: unknown) => {
    deps.persistComputerUse(enabled === true);
  });

  ipcMain.handle("agent:computer-use:status", () => computerUseAvailable());

  ipcMain.handle("agent:computer-use:install", () => installCliclick());
}
