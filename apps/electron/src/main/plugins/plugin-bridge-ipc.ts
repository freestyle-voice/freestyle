import { createAppLogger } from "@freestyle-voice/utils";
import { clipboard, ipcMain, shell } from "electron";
import type { HostActions } from "freestyle-voice";
import { getPillPanelController, handlePillAction } from "./pill-panel.js";

const log = createAppLogger("plugin-bridge");

/** Schemes a widget is allowed to open via `openExternal`. */
const OPENABLE_SCHEMES = new Set([
  "http:",
  "https:",
  "mailto:",
  "tel:",
  // UPI / payment app deep-links.
  "upi:",
  "gpay:",
  "phonepe:",
  "paytmmp:",
  "bhim:",
  "credpay:",
  "super:",
]);

/** Reject `file:`, `javascript:`, and other unexpected/unsafe schemes. */
function isOpenableUrl(url: string): boolean {
  try {
    return OPENABLE_SCHEMES.has(new URL(url).protocol);
  } catch {
    return false;
  }
}

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

  ipcMain.handle("plugin-bridge:config", (e) => {
    // The pill panel and dashboard pages share this preload/channel but pull
    // theme tokens from different sources. Route by the calling webContents so
    // the pill panel gets the pill window's tokens (it may load before the
    // dashboard exists, when getDashboardTokens() would be empty).
    const pill = getPillPanelController();
    if (pill && e.sender.id === pill.getViewWebContentsId()) {
      return pill.getTokens();
    }
    return deps?.getDashboardTokens() ?? {};
  });

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

      // `copy` is window-agnostic — handle it directly so it works from the
      // pill panel even when the dashboard (and its onDashboardAction) has
      // never been created.
      if (channel === "copy") {
        const text = (payload as HostActions["copy"]).text;
        if (typeof text === "string") clipboard.writeText(text);
        return;
      }

      // `openExternal` hands a URL (http(s) or a custom scheme like a `upi://`
      // payment deep-link) to the OS. Window-agnostic so widgets in the pill
      // can trigger it. Only allow safe-looking schemes.
      if (channel === "openExternal") {
        const url = (payload as HostActions["openExternal"]).url;
        if (typeof url === "string" && isOpenableUrl(url)) {
          // openExternal rejects when the OS has no handler for the scheme
          // (e.g. a `gpay://` deep-link on a desktop without the app). Swallow
          // it so it doesn't surface as an unhandled rejection.
          shell.openExternal(url).catch((err) => {
            log.warn(
              `openExternal could not open "${url}": ${
                err instanceof Error ? err.message : String(err)
              }`,
            );
          });
        } else {
          log.warn(`openExternal blocked for url: ${String(url)}`);
        }
        return;
      }

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
