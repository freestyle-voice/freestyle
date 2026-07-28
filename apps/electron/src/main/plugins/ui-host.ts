import { type BrowserWindow, ipcMain } from "electron";
import type { HostActions } from "freestyle-voice";
import { setPluginBridgeDeps } from "./plugin-bridge-ipc.js";
import {
  PluginViewManager,
  pluginBridgePreloadPath,
  type ViewBounds,
} from "./view-manager.js";

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
  // Reuse a single manager across window re-opens: its session request filters
  // are installed per persistent partition, so a fresh instance each time would
  // orphan the old filter closures (Electron keeps only the last one) and make
  // the manager's "already installed" bookkeeping lie. Only the window changes.
  if (!viewManager) {
    viewManager = new PluginViewManager(
      pluginBridgePreloadPath(),
      deps.getServerBaseUrl,
      deps.getServerToken,
    );
  }
  viewManager.attachWindow(deps.window);

  // Feed the shared plugin-bridge IPC our token source + action handler. The
  // IPC itself is registered once at app startup (registerPluginBridgeIpc),
  // so the pill panel works even before the dashboard window opens.
  setPluginBridgeDeps({
    getDashboardTokens: () => viewManager?.getTokens() ?? {},
    onDashboardAction: (channel, payload) => deps.onAction(channel, payload),
  });

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
}

/**
 * Discard all cached plugin views. Call when the server target (URL/token)
 * changes: cached views hold pages loaded from the previous origin, so they'd
 * otherwise serve stale content and miss the new origin's auth-header injection.
 * The next open reloads from the current server.
 */
export function invalidatePluginViews(): void {
  viewManager?.invalidate();
}
