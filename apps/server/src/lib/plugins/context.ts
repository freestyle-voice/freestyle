import type {
  PluginContext,
  PluginLogger,
  SettingsReader,
} from "@freestyle/sdk";
import { createAppLogger } from "@freestyle/utils";
import { getDb } from "../db.js";

/** Read a single settings value, used by the scoped {@link SettingsReader}. */
function readSetting(key: string): string | undefined {
  const row = getDb()
    .prepare("SELECT value FROM settings WHERE key = ?")
    .get(key) as { value: string } | undefined;
  return row?.value;
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
 * Build the read-only context handed to a plugin's `setup` hook. Settings reads
 * go straight to the SQLite `settings` table; the plugin's own namespaced keys
 * are stored under `plugin:<name>:<key>`.
 */
export function buildPluginContext(name: string): PluginContext {
  const settings: SettingsReader = {
    get: (key) => readSetting(key),
    getOwn: (key) => readSetting(`plugin:${name}:${key}`),
  };

  return {
    name,
    host: "server",
    directory: process.env.FREESTYLE_DB_PATH
      ? dirOf(process.env.FREESTYLE_DB_PATH)
      : process.cwd(),
    logger: buildLogger(name),
    settings,
  };
}

function dirOf(filePath: string): string {
  const idx = Math.max(filePath.lastIndexOf("/"), filePath.lastIndexOf("\\"));
  return idx > 0 ? filePath.slice(0, idx) : filePath;
}
