import type { HostActions } from "@freestyle/sdk";
import { createAppLogger } from "@freestyle/utils";
import { type BrowserWindow, ipcMain } from "electron";
import type { DiscoveredPlugin } from "./manifest.js";
import {
  getDiscoveredPlugins,
  refreshDiscoveredPlugins,
  registerPluginProtocol,
  registerPluginSchemePrivileges,
} from "./ui.js";
import {
  type BridgeConfig,
  PluginViewManager,
  pluginBridgePreloadPath,
  type ViewBounds,
} from "./view-manager.js";

const log = createAppLogger("plugins-ui");

/** Host capabilities the plugin UI layer needs, injected from the main entry. */
export interface PluginUiHostDeps {
  /** The dashboard window the plugin views overlay. */
  window: BrowserWindow;
  /** Resolve the bridge config (server URL/token + theme tokens) on demand. */
  getBridgeConfig: () => BridgeConfig;
  /**
   * Resolve the current `plugins` setting value + the user-data dir for
   * discovery. Async because the setting is read from the (possibly remote)
   * server over HTTP.
   */
  getDiscoverySources: () => Promise<{
    pluginsSetting: string | undefined;
    userDataDir: string;
  }>;
  /** Perform a host action requested by a plugin page. */
  onAction: <C extends keyof HostActions>(
    channel: C,
    payload: HostActions[C],
  ) => void | Promise<void>;
}

let viewManager: PluginViewManager | null = null;

/**
 * Register the plugin scheme privileges. Must run **before** `app.ready`,
 * alongside the `app://` privilege registration.
 */
export function registerPluginUiPrivileges(): void {
  registerPluginSchemePrivileges();
}

/**
 * Wire up the plugin UI host: the asset protocol, the view manager, and all
 * IPC. Call once after the dashboard window exists. Plugin discovery is
 * refreshed lazily via {@link refreshPluginUi}.
 */
export function initPluginUiHost(deps: PluginUiHostDeps): void {
  registerPluginProtocol();

  viewManager = new PluginViewManager(
    pluginBridgePreloadPath(),
    deps.getBridgeConfig,
  );
  viewManager.attachWindow(deps.window);

  ipcMain.handle("plugins:list", () =>
    serializePlugins(getDiscoveredPlugins()),
  );

  ipcMain.handle("plugins:refresh", async () => {
    const { pluginsSetting, userDataDir } = await deps.getDiscoverySources();
    refreshDiscoveredPlugins(pluginsSetting, userDataDir);
    return serializePlugins(getDiscoveredPlugins());
  });

  ipcMain.handle(
    "plugin-view:show",
    (
      _e,
      slug: string,
      pageId: string,
      bounds: ViewBounds,
      tokens?: Record<string, string>,
    ) => viewManager?.show(slug, pageId, bounds, tokens) ?? false,
  );

  ipcMain.on("plugin-view:set-bounds", (_e, bounds: ViewBounds) => {
    viewManager?.setBounds(bounds);
  });

  ipcMain.on("plugin-view:hide", () => {
    viewManager?.hide();
  });

  // The plugin frame's preload fetches its bridge config (server URL/token +
  // theme tokens) over IPC, so the token never appears in process arguments.
  ipcMain.handle(
    "plugin-bridge:config",
    () => viewManager?.getConfig() ?? null,
  );

  ipcMain.handle(
    "plugin-bridge:action",
    async <C extends keyof HostActions>(
      _e: unknown,
      channel: C,
      payload: HostActions[C],
    ) => {
      try {
        await deps.onAction(channel, payload);
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

/** Re-scan installed plugins; returns the serialized list for the renderer. */
export function refreshPluginUi(
  pluginsSetting: string | undefined,
  userDataDir: string,
): ReturnType<typeof serializePlugins> {
  refreshDiscoveredPlugins(pluginsSetting, userDataDir);
  return serializePlugins(getDiscoveredPlugins());
}

/** Strip the absolute `dir` before sending plugin info to the renderer. */
function serializePlugins(plugins: readonly DiscoveredPlugin[]) {
  return plugins.map((p) => ({
    name: p.name,
    slug: p.slug,
    specifier: p.specifier,
    local: p.local,
    pages: p.pages,
    ...(p.description ? { description: p.description } : {}),
    ...(p.author ? { author: p.author } : {}),
  }));
}
