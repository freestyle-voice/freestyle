/**
 * Agent IPC surface (Voice OS). Registered once from main/index.ts. Keeps the
 * agent wiring out of the already-large index.ts.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentAuthMode } from "@freestyle/validations";
import { app, ipcMain, shell } from "electron";
import { getPrereqStatus } from "./auth.js";
import {
  computerUseEnabled,
  computerUsePrereqs,
  installCliclick,
  requestScreenRecording,
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
  /** Report the live collapsed-pill hit-box (window-relative CSS px) so main's
   *  hover hit-testing matches the visible pill. Null clears it (fall back to
   *  the default strip band). */
  setHoverRect: (
    rect: { x: number; y: number; width: number; height: number } | null,
  ) => void;
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

  ipcMain.on("agent-bar:hover-rect", (_event, rect: unknown) => {
    if (rect && typeof rect === "object") {
      const r = rect as Record<string, unknown>;
      if (
        typeof r.x === "number" &&
        typeof r.y === "number" &&
        typeof r.width === "number" &&
        typeof r.height === "number"
      ) {
        deps.setHoverRect({
          x: r.x,
          y: r.y,
          width: r.width,
          height: r.height,
        });
        return;
      }
    }
    deps.setHoverRect(null);
  });

  // ---- Computer use (opt-in, experimental) ----
  ipcMain.handle("agent:computer-use:get", () => computerUseEnabled());

  ipcMain.on("agent:computer-use:set", (_event, enabled: unknown) => {
    deps.persistComputerUse(enabled === true);
  });

  // Returns the full per-item prereq snapshot (helper + Accessibility + Screen
  // Recording), not just a single boolean, so the UI can guide each fix.
  ipcMain.handle("agent:computer-use:status", () => computerUsePrereqs());

  ipcMain.handle("agent:computer-use:install", () => installCliclick());

  // Trigger the macOS Screen Recording prompt (no askForMediaAccess exists for
  // "screen", so we attempt a capture) and open the relevant settings pane.
  ipcMain.handle("agent:computer-use:request-screen-recording", async () => {
    if (process.platform === "darwin") {
      shell.openExternal(
        "x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?Privacy_ScreenCapture",
      );
    }
    return requestScreenRecording();
  });
}
