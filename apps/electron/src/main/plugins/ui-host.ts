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

  // Proxy a plugin page's server API request. The page can't fetch the loopback
  // server directly (mixed content from its secure custom-scheme origin), so
  // main performs the request and returns a serialized response.
  ipcMain.handle(
    "plugin-bridge:fetch",
    async (_e, req: PluginFetchRequest): Promise<PluginFetchResponse> => {
      const config = deps.getBridgeConfig();
      const url = `${config.serverUrl}${req.path}`;
      const headers = new Headers(req.headers);
      if (config.token) headers.set("Authorization", `Bearer ${config.token}`);

      const res = await fetch(url, {
        method: req.method,
        headers,
        body: deserializeBody(req.body),
      });

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

/** A request proxied from a plugin page's bridge `api()` call. */
interface PluginFetchRequest {
  path: string;
  method: string;
  headers: Record<string, string>;
  body: SerializedBody;
}

interface PluginFetchResponse {
  ok: boolean;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: ArrayBuffer;
}

/** IPC-serializable request body (mirrors the preload's serializeBody). */
type SerializedBody =
  | { kind: "none" }
  | { kind: "text"; value: string }
  | { kind: "binary"; data: ArrayBuffer; type: string }
  | {
      kind: "form";
      fields: Array<
        | { type: "text"; name: string; value: string }
        | {
            type: "file";
            name: string;
            filename: string;
            mime: string;
            data: ArrayBuffer;
          }
      >;
    };

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
    ...(p.icon ? { icon: p.icon } : {}),
  }));
}
