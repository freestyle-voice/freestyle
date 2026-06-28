import { createAppLogger } from "@freestyle-voice/utils";
import { type BrowserWindow, ipcMain } from "electron";
import type { HostActions } from "freestyle-voice";
import type {
  PluginFetchRequest,
  PluginFetchResponse,
  SerializedBody,
} from "../../shared/bridge-protocol";
import type { DiscoveredPlugin } from "./manifest.js";
import {
  getDiscoveredPlugins,
  refreshDiscoveredPlugins,
  registerPluginProtocol,
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
  /** Resolve the bridge config (server URL + theme tokens) on demand. */
  getBridgeConfig: () => BridgeConfig;
  /**
   * Resolve the current `plugins` setting value + the user-data dir for
   * discovery. Async because the setting is read from the (possibly remote)
   * server over HTTP.
   */
  getDiscoverySources: () => Promise<{
    pluginsSetting: string | undefined;
    userDataDir: string;
    disabledPlugins: ReadonlySet<string>;
  }>;
  /** Persist a plugin's enabled state (writes the `disabled_plugins` setting). */
  setPluginEnabled: (specifier: string, enabled: boolean) => Promise<void>;
  /** Fetch the installable plugin catalog from the server. */
  getCatalog: () => Promise<unknown>;
  /** Install a plugin by npm name (server + desktop). */
  installPlugin: (npmName: string, version?: string) => Promise<void>;
  /** Uninstall a plugin by specifier (server + desktop). */
  uninstallPlugin: (specifier: string) => Promise<void>;
  /** Perform a host action requested by a plugin page. */
  onAction: <C extends keyof HostActions>(
    channel: C,
    payload: HostActions[C],
  ) => void | Promise<void>;
}

let viewManager: PluginViewManager | null = null;

export { PLUGIN_SCHEME_PRIVILEGE } from "./ui.js";

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
    const { pluginsSetting, userDataDir, disabledPlugins } =
      await deps.getDiscoverySources();
    refreshDiscoveredPlugins(pluginsSetting, userDataDir, disabledPlugins);
    return serializePlugins(getDiscoveredPlugins());
  });

  ipcMain.handle(
    "plugins:set-enabled",
    async (_e, specifier: string, enabled: boolean) => {
      await deps.setPluginEnabled(specifier, enabled);
      const { pluginsSetting, userDataDir, disabledPlugins } =
        await deps.getDiscoverySources();
      refreshDiscoveredPlugins(pluginsSetting, userDataDir, disabledPlugins);
      return serializePlugins(getDiscoveredPlugins());
    },
  );

  ipcMain.handle("plugins:catalog", () => deps.getCatalog());

  ipcMain.handle(
    "plugins:install",
    async (_e, npmName: string, version: string | undefined) => {
      await deps.installPlugin(npmName, version);
      const { pluginsSetting, userDataDir, disabledPlugins } =
        await deps.getDiscoverySources();
      refreshDiscoveredPlugins(pluginsSetting, userDataDir, disabledPlugins);
      return serializePlugins(getDiscoveredPlugins());
    },
  );

  ipcMain.handle("plugins:uninstall", async (_e, specifier: string) => {
    await deps.uninstallPlugin(specifier);
    const { pluginsSetting, userDataDir, disabledPlugins } =
      await deps.getDiscoverySources();
    refreshDiscoveredPlugins(pluginsSetting, userDataDir, disabledPlugins);
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

  // The plugin frame's preload fetches its bridge config (server URL + theme
  // tokens) over IPC.
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

  // Proxy a plugin page's server API request. The page can't fetch the loopback
  // server directly (mixed content from its secure custom-scheme origin), so
  // main performs the request and returns a serialized response.
  ipcMain.handle(
    "plugin-bridge:fetch",
    async (_e, req: PluginFetchRequest): Promise<PluginFetchResponse> => {
      const config = deps.getBridgeConfig();
      const url = `${config.serverUrl}${req.path}`;
      const body = deserializeBody(req.body);

      const headers = new Headers(req.headers);
      // For a FormData body, undici must generate the multipart Content-Type
      // (with its boundary). A caller-supplied content-type would suppress that
      // and leave the server unable to parse the parts, so drop it here.
      if (req.body.kind === "form") headers.delete("content-type");

      const res = await fetch(url, { method: req.method, headers, body });

      const resHeaders: Record<string, string> = {};
      res.headers.forEach((value, key) => {
        resHeaders[key] = value;
      });
      return {
        ok: res.ok,
        status: res.status,
        statusText: res.statusText,
        headers: resHeaders,
        body: await res.arrayBuffer(),
      };
    },
  );
}

/** Reconstruct a fetch body from its serialized form. */
function deserializeBody(body: SerializedBody): BodyInit | undefined {
  switch (body.kind) {
    case "none":
      return undefined;
    case "text":
      return body.value;
    case "binary":
      return body.data;
    case "form": {
      const form = new FormData();
      for (const field of body.fields) {
        if (field.type === "text") {
          form.append(field.name, field.value);
        } else {
          form.append(
            field.name,
            new File([field.data], field.filename, { type: field.mime }),
          );
        }
      }
      return form;
    }
  }
}

/** Re-scan installed plugins; returns the serialized list for the renderer. */
export function refreshPluginUi(
  pluginsSetting: string | undefined,
  userDataDir: string,
  disabled: ReadonlySet<string> = new Set(),
): ReturnType<typeof serializePlugins> {
  refreshDiscoveredPlugins(pluginsSetting, userDataDir, disabled);
  return serializePlugins(getDiscoveredPlugins());
}

/** Strip the absolute `dir` before sending plugin info to the renderer. */
function serializePlugins(plugins: readonly DiscoveredPlugin[]) {
  return plugins.map((p) => ({
    name: p.name,
    slug: p.slug,
    specifier: p.specifier,
    local: p.local,
    enabled: p.enabled,
    pages: p.pages,
    ...(p.missing ? { missing: true } : {}),
    ...(p.version ? { version: p.version } : {}),
    ...(p.description ? { description: p.description } : {}),
    ...(p.author ? { author: p.author } : {}),
    ...(p.icon ? { icon: p.icon } : {}),
    ...(p.readme ? { readme: p.readme } : {}),
  }));
}
