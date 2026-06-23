import path from "node:path";
import type { HookFailure, PluginEntry } from "@freestyle/sdk";
import { loadPlugins, type PluginRegistry } from "@freestyle/sdk";
import type { AppType } from "@freestyle/server";
import { createAppLogger } from "@freestyle/utils";
import { parsePluginsSetting, pluginEntryParts } from "@freestyle/validations";
import { hc } from "hono/client";
import { buildPluginContext, type SettingsSnapshot } from "./context.js";

const log = createAppLogger("plugins");

const FETCH_TIMEOUT_MS = 5000;

/** Where the app reaches the (possibly remote) Freestyle server. */
export interface ServerTarget {
  /** Base URL, e.g. `http://127.0.0.1:4649` or a configured remote server. */
  baseUrl: string;
  /** Optional bearer token for a configured server ("" = none). */
  token?: string;
  /** Electron's local user-data directory; app-host plugins live under it. */
  directory: string;
}

/**
 * Load all plugins for the Electron main process. Settings come from the server
 * over HTTP (it owns the database, which may be remote), so we fetch a snapshot
 * of the `settings` table once and resolve the `plugins` list and every plugin
 * `setup` context from it. Same sources and ordering as the server host; each
 * plugin's app-side hooks (e.g. `beforeOutput`) run here while its server hooks
 * run in the server.
 */
export async function loadAppPlugins(
  target: ServerTarget,
): Promise<PluginRegistry> {
  const snapshot = await fetchSettings(target);

  const entries: PluginEntry[] = parsePluginsSetting(snapshot.plugins).map(
    (entry) => pluginEntryParts(entry),
  );
  const localDir = path.join(target.directory, "plugins");

  return loadPlugins({
    entries,
    localDir,
    buildContext: (name) =>
      buildPluginContext(name, snapshot, target.directory),
    logger: log,
    onError: reportHookFailure,
  });
}

/**
 * Fetch the server's `settings` table over HTTP. Returns an empty snapshot when
 * the server is unreachable or rejects the request — plugins then load with no
 * settings rather than blocking output delivery.
 */
async function fetchSettings(target: ServerTarget): Promise<SettingsSnapshot> {
  try {
    const client = hc<AppType>(target.baseUrl, {
      headers: target.token ? { Authorization: `Bearer ${target.token}` } : {},
    });
    const res = await client.api.settings.$get(
      {},
      { init: { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) } },
    );
    if (!res.ok) {
      log.warn(`settings fetch failed: HTTP ${res.status}`);
      return {};
    }
    return (await res.json()) as SettingsSnapshot;
  } catch (err) {
    log.warn(
      `settings fetch failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return {};
  }
}

function reportHookFailure({ plugin, hook, error }: HookFailure): void {
  log.error(
    `plugin "${plugin}" failed in hook "${hook}": ${
      error instanceof Error ? error.message : String(error)
    }`,
  );
}
