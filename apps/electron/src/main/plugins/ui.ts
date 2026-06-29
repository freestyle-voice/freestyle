import { pathToFileURL } from "node:url";
import { createAppLogger } from "@freestyle-voice/utils";
import { net, protocol } from "electron";
import {
  type DiscoveredPlugin,
  discoverPlugins,
  resolvePluginAsset,
} from "./manifest.js";

const log = createAppLogger("plugins-ui");

/** The custom scheme that serves plugin UI assets. */
export const PLUGIN_SCHEME = "freestyle-plugin";

let discovered: DiscoveredPlugin[] = [];
let protocolRegistered = false;

export const PLUGIN_SCHEME_PRIVILEGE: Electron.CustomScheme = {
  scheme: PLUGIN_SCHEME,
  privileges: {
    standard: true,
    secure: true,
    supportFetchAPI: true,
    corsEnabled: true,
  },
};

/**
 * Register the `freestyle-plugin://<pluginName>/<assetPath>` handler. Serves
 * files **only** from the requested plugin's package directory; any path that
 * escapes the plugin root (or names an unknown plugin) is rejected.
 *
 * Safe to call multiple times — the protocol is only registered once.
 */
export function registerPluginProtocol(): void {
  if (protocolRegistered) return;
  protocolRegistered = true;

  protocol.handle(PLUGIN_SCHEME, (request) => {
    const url = new URL(request.url);
    // URL shape: freestyle-plugin://<pluginSlug>/<assetPath>. The slug is
    // already URL-safe (no @ or /), so the host round-trips cleanly through
    // Chromium's standard-scheme canonicalization.
    const filePath = resolvePluginAsset(discovered, url.hostname, url.pathname);
    if (!filePath) {
      return new Response("Not found", { status: 404 });
    }
    return net.fetch(pathToFileURL(filePath).toString());
  });
}

/**
 * Re-scan installed plugins from the current `plugins` setting + local dir.
 * Call after the server is reachable and whenever the plugin list changes.
 */
export function refreshDiscoveredPlugins(
  pluginsSetting: string | undefined,
  userDataDir: string,
  disabled: ReadonlySet<string> = new Set(),
): DiscoveredPlugin[] {
  discovered = discoverPlugins(pluginsSetting, userDataDir, disabled);
  log.info(
    `discovered ${discovered.length} plugin(s); ${discovered.reduce(
      (n, p) => n + p.pages.length,
      0,
    )} UI page(s)`,
  );
  return discovered;
}

/** The current discovered plugins (empty until {@link refreshDiscoveredPlugins}). */
export function getDiscoveredPlugins(): DiscoveredPlugin[] {
  return discovered;
}

/** Build the `freestyle-plugin://` URL for a plugin page's entry asset. */
export function pluginPageUrl(pluginSlug: string, entry: string): string {
  const assetPath = entry.split("/").map(encodeURIComponent).join("/");
  return `${PLUGIN_SCHEME}://${pluginSlug}/${assetPath}`;
}
