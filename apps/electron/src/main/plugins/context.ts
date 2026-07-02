import { createAppLogger } from "@freestyle-voice/utils";
import type {
  PluginContext,
  PluginStorage,
  SettingsReader,
} from "freestyle-voice";
import { createPluginLogger } from "freestyle-voice";

const log = createAppLogger("plugins");

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
 *
 * Storage is read-only on the app side: `get` resolves from the snapshot,
 * while `set` and `delete` are no-ops (the server owns the database).
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

  const storage: PluginStorage = {
    async get<T = unknown>(key: string): Promise<T | undefined> {
      const raw = snapshot[`plugin:${name}:${key}`];
      if (raw === undefined) return undefined;
      try {
        return JSON.parse(raw) as T;
      } catch {
        return undefined;
      }
    },
    async set(_key: string, _value: unknown): Promise<void> {
      log.warn(
        `plugin "${name}" attempted storage.set() on the app side — writes are only supported on the server`,
      );
    },
    async delete(_key: string): Promise<void> {
      log.warn(
        `plugin "${name}" attempted storage.delete() on the app side — writes are only supported on the server`,
      );
    },
  };

  return {
    name,
    mode: "app",
    directory,
    logger: createPluginLogger(createAppLogger(`plugin:${name}`)),
    settings,
    storage,
  };
}
