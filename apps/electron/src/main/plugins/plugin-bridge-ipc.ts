import { createAppLogger } from "@freestyle-voice/utils";
import { ipcMain } from "electron";
import type { HostActions } from "freestyle-voice";
import { handlePillAction } from "./pill-panel.js";

const log = createAppLogger("plugin-bridge");

/**
 * Shared `plugin-bridge:*` IPC used by *every* plugin `WebContentsView` — the
 * dashboard-hosted pages AND the pill panel — since they all load the same
 * `plugin-bridge.ts` preload. These must be registered once at app startup,
 * not lazily when a window opens: the pill panel can load before the dashboard
 * ever exists, so registering them in the dashboard's `initPluginUiHost` left
 * the pill panel calling unregistered channels ("No handler registered for
 * 'plugin-bridge:config'").
 */
interface PluginBridgeDeps {
  /** Theme tokens for a dashboard-hosted plugin page, if one is active. */
  getDashboardTokens: () => { tokens?: Record<string, string> };
  /** Perform a non-pill host action (copy / toast / navigate). */
  onDashboardAction: <C extends keyof HostActions>(
    channel: C,
    payload: HostActions[C],
  ) => void | Promise<void>;
}

let deps: PluginBridgeDeps | null = null;
let registered = false;

/** Provide/refresh the dashboard-side dependencies (called on window create). */
export function setPluginBridgeDeps(next: PluginBridgeDeps): void {
  deps = next;
}

/** Register the shared bridge IPC once, at app startup. */
export function registerPluginBridgeIpc(): void {
  if (registered) return;
  registered = true;

  ipcMain.handle(
    "plugin-bridge:config",
    () => deps?.getDashboardTokens() ?? {},
  );

  ipcMain.handle(
    "plugin-bridge:action",
    async <C extends keyof HostActions>(
      _e: unknown,
      channel: C,
      payload: HostActions[C],
    ) => {
      // Pill-scoped actions (expand/collapse/set-badge) are handled by the pill
      // controller regardless of which window is open.
      if (handlePillAction(channel, payload)) return;
      try {
        await deps?.onDashboardAction(channel, payload);
      } catch (err) {
        log.error(
          `plugin action "${String(channel)}" failed: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    },
  );
}
