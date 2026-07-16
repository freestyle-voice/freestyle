import { createAppLogger } from "@freestyle-voice/utils";
import { type BrowserWindow, ipcMain } from "electron";
import type { HostActions } from "freestyle-voice";
import {
  PluginViewManager,
  pluginBridgePreloadPath,
  type ViewBounds,
} from "./view-manager.js";

const log = createAppLogger("plugins-ui");

/** Host capabilities the plugin UI layer needs, injected from the main entry. */
export interface PluginUiHostDeps {
  /** The dashboard window the plugin views overlay. */
  window: BrowserWindow;
  /** Resolve the server base URL that serves plugin UI + API (local or remote). */
  getServerBaseUrl: () => string;
  /** Bearer token for a configured server ("" = local server / no auth). */
  getServerToken: () => string;
  /** Perform a host action requested by a plugin page. */
  onAction: <C extends keyof HostActions>(
    channel: C,
    payload: HostActions[C],
  ) => void | Promise<void>;
}

let viewManager: PluginViewManager | null = null;
let currentDeps: PluginUiHostDeps | null = null;
let ipcRegistered = false;

/**
 * Wire up the plugin UI host: the view manager and the remaining IPC. Plugin
 * discovery, install/uninstall, catalog, and asset serving all live server-side
 * now (the renderer talks to the server directly); this process only overlays a
 * plugin's page in a `WebContentsView` and relays host actions.
 *
 * Safe to call multiple times (e.g. when the settings window is re-opened) —
 * the IPC handlers register only once, while the window/deps update each call.
 */
export function initPluginUiHost(deps: PluginUiHostDeps): void {
  currentDeps = deps;

  viewManager = new PluginViewManager(
    pluginBridgePreloadPath(),
    deps.getServerBaseUrl,
    deps.getServerToken,
  );
  viewManager.attachWindow(deps.window);

  if (ipcRegistered) return;
  ipcRegistered = true;

  ipcMain.handle(
    "plugin-view:show",
    (
      _e,
      slug: string,
      pageId: string,
      entry: string,
      bounds: ViewBounds,
      tokens?: Record<string, string>,
    ) => viewManager?.show(slug, pageId, entry, bounds, tokens) ?? false,
  );

  ipcMain.on("plugin-view:set-bounds", (_e, bounds: ViewBounds) => {
    viewManager?.setBounds(bounds);
  });

  ipcMain.on("plugin-view:hide", () => {
    viewManager?.hide();
  });

  // A freshly installed/updated/uninstalled plugin must not re-attach a cached
  // view running stale code — the renderer signals a change here.
  ipcMain.on("plugin-view:invalidate", () => {
    viewManager?.invalidate();
  });

  // The plugin frame's preload fetches its theme tokens over IPC.
  ipcMain.handle("plugin-bridge:config", () => viewManager?.getTokens() ?? {});

  ipcMain.handle(
    "plugin-bridge:action",
    async <C extends keyof HostActions>(
      _e: unknown,
      channel: C,
      payload: HostActions[C],
    ) => {
      try {
        await currentDeps!.onAction(channel, payload);
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
