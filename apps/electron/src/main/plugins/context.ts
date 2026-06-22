import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type {
  PluginContext,
  PluginLogger,
  SettingsReader,
} from "@freestyle/sdk";
import { createAppLogger } from "@freestyle/utils";

/**
 * Read a single value from the `settings` table the server owns. The main
 * process opens a short-lived read connection to the same SQLite file (the
 * established pattern in this process — see hotkey loading). Returns
 * `undefined` when the key is unset or the database is unavailable.
 */
export function readSetting(key: string): string | undefined {
  const dbPath = process.env.FREESTYLE_DB_PATH;
  if (!dbPath) return undefined;
  let db: DatabaseSync | undefined;
  try {
    db = new DatabaseSync(dbPath);
    const row = db
      .prepare("SELECT value FROM settings WHERE key = ?")
      .get(key) as { value: string } | undefined;
    return row?.value;
  } catch {
    return undefined;
  } finally {
    db?.close();
  }
}

/** Wrap a namespaced winston logger in the SDK's {@link PluginLogger} shape. */
function buildLogger(name: string): PluginLogger {
  const log = createAppLogger(`plugin:${name}`);
  const fmt = (message: string, extra?: Record<string, unknown>): string =>
    extra ? `${message} ${JSON.stringify(extra)}` : message;
  return {
    debug: (message, extra) => log.debug(fmt(message, extra)),
    info: (message, extra) => log.info(fmt(message, extra)),
    warn: (message, extra) => log.warn(fmt(message, extra)),
    error: (message, extra) => log.error(fmt(message, extra)),
  };
}

/**
 * Build the context handed to an app-host plugin's `setup` hook. Settings reads
 * hit the same `settings` table the server uses; namespaced plugin keys live
 * under `plugin:<name>:<key>`.
 */
export function buildPluginContext(name: string): PluginContext {
  const settings: SettingsReader = {
    get: (key) => readSetting(key),
    getOwn: (key) => readSetting(`plugin:${name}:${key}`),
  };

  return {
    name,
    host: "app",
    directory: process.env.FREESTYLE_DB_PATH
      ? path.dirname(process.env.FREESTYLE_DB_PATH)
      : process.cwd(),
    logger: buildLogger(name),
    settings,
  };
}
