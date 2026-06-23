import { existsSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { PluginContext, SettingsReader } from "@freestyle/sdk";
import { createPluginLogger } from "@freestyle/sdk";
import { createAppLogger } from "@freestyle/utils";

/**
 * Read a single value from the `settings` table the server owns. The main
 * process opens a short-lived read-only connection to the same SQLite file
 * (the established pattern in this process — see hotkey loading). Returns
 * `undefined` when the key is unset or the database is unavailable. The
 * existence + read-only checks ensure a read can never create the db file.
 */
export function readSetting(key: string): string | undefined {
  const dbPath = process.env.FREESTYLE_DB_PATH;
  if (!dbPath || !existsSync(dbPath)) return undefined;
  let db: DatabaseSync | undefined;
  try {
    db = new DatabaseSync(dbPath, { readOnly: true });
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
    mode: "app",
    directory: process.env.FREESTYLE_DB_PATH
      ? path.dirname(process.env.FREESTYLE_DB_PATH)
      : process.cwd(),
    logger: createPluginLogger(createAppLogger(`plugin:${name}`)),
    settings,
  };
}
