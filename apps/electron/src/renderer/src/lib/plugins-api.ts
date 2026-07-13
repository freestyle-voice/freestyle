import { parseDisabledPlugins } from "@freestyle-voice/validations";
import type {
  PluginCatalogEntry,
  PluginInfo,
  PluginUpdateCheck,
  PluginUpdateResult,
} from "@shared/plugins";
import { getClient } from "./api";

/**
 * Renderer-side plugin management, talking to the server over the typed `hc`
 * client. Discovery, install/uninstall, catalog, and asset serving all live
 * server-side now; this replaces the old `window.api.*` plugin IPC.
 */

/** The discovered plugin list for the hub. */
export async function listPlugins(): Promise<PluginInfo[]> {
  const res = await getClient().api.plugins.$get();
  if (!res.ok) throw new Error(`plugins list failed: HTTP ${res.status}`);
  const { plugins } = await res.json();
  return plugins as PluginInfo[];
}

/** Enable/disable a plugin, then reload the server registry so it takes effect. */
export async function setPluginEnabled(
  specifier: string,
  enabled: boolean,
): Promise<PluginInfo[]> {
  const client = getClient();
  const settings = await client.api.settings.$get();
  const snapshot = settings.ok
    ? ((await settings.json()) as Record<string, string>)
    : {};
  const disabled = new Set(parseDisabledPlugins(snapshot.disabled_plugins));
  if (enabled) disabled.delete(specifier);
  else disabled.add(specifier);

  await client.api.settings[":key"].$put({
    param: { key: "disabled_plugins" },
    json: { value: JSON.stringify([...disabled]) },
  });
  await client.api.plugins.reload.$post();
  return listPlugins();
}

/** The installable plugin catalog. */
export async function getPluginCatalog(): Promise<PluginCatalogEntry[]> {
  const res = await getClient().api.plugins.catalog.$get();
  if (!res.ok) throw new Error(`catalog fetch failed: HTTP ${res.status}`);
  const { plugins } = await res.json();
  return plugins as PluginCatalogEntry[];
}

/** Install a plugin by npm name (the server reloads its registry itself). */
export async function installPlugin(
  npmName: string,
  version?: string,
): Promise<PluginInfo[]> {
  const res = await getClient().api.plugins.install.$post({
    json: { npmName, ...(version ? { version } : {}) },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `install failed: HTTP ${res.status}`);
  }
  // A reinstalled/updated plugin's cached view must reload from the server.
  window.api.invalidatePluginView();
  return listPlugins();
}

/** Uninstall a plugin by specifier. */
export async function uninstallPlugin(
  specifier: string,
): Promise<PluginInfo[]> {
  const res = await getClient().api.plugins.uninstall.$post({
    json: { specifier },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `uninstall failed: HTTP ${res.status}`);
  }
  window.api.invalidatePluginView();
  return listPlugins();
}

/** Check the npm registry for newer versions of the given plugins. */
export async function checkPluginUpdates(
  plugins: PluginUpdateCheck[],
): Promise<PluginUpdateResult[]> {
  const res = await getClient().api.plugins["check-updates"].$post({
    json: { plugins },
  });
  if (!res.ok) throw new Error(`check-updates failed: HTTP ${res.status}`);
  const { updates } = await res.json();
  return updates as PluginUpdateResult[];
}
