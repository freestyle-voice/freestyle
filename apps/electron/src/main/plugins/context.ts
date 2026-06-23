import type { PluginContext, SettingsReader } from "@freestyle/sdk";
import { createPluginLogger } from "@freestyle/sdk";
import { createAppLogger } from "@freestyle/utils";

/**
 * A read-only snapshot of the server's `settings` table, fetched once over HTTP
 * when the app plugin registry is loaded. The app never touches the database
 * directly — the server owns it and may be remote — so settings are resolved
 * from this snapshot the server hands back.
 */
export type SettingsSnapshot = Readonly<Record<string, string>>;

/**
 * Build the context handed to an app-host plugin's `setup` hook. Settings are
 * served synchronously from the snapshot the server provided; namespaced plugin
 * keys live under `plugin:<name>:<key>`, matching the server host.
 */
export function buildPluginContext(
  name: string,
  snapshot: SettingsSnapshot,
  directory: string,
): PluginContext {
  const settings: SettingsReader = {
    get: (key) => snapshot[key],
    getOwn: (key) => snapshot[`plugin:${name}:${key}`],
  };

  return {
    name,
    mode: "app",
    directory,
    logger: createPluginLogger(createAppLogger(`plugin:${name}`)),
    settings,
  };
}
