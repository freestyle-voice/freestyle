import path from "node:path";
import { createAppLogger } from "@freestyle-voice/utils";
import type {
  PluginContext,
  PluginStorage,
  SettingsReader,
} from "freestyle-voice";
import { createPluginLogger } from "freestyle-voice";
import { deleteSetting, readSetting, writeSetting } from "../db.js";

const STORAGE_PREFIX = "plugin:";

/**
 * Build the context handed to a plugin's `setup` hook. Settings reads go
 * straight to the SQLite `settings` table; the plugin's own namespaced keys
 * are stored under `plugin:<name>:<key>`. Storage provides full read/write
 * access to per-plugin persistent JSON data in the same table.
 */
export function buildPluginContext(name: string): PluginContext {
  const settings: SettingsReader = {
    get: (key) => readSetting(key),
    getOwn: (key) => readSetting(`${STORAGE_PREFIX}${name}:${key}`),
  };

  const storage: PluginStorage = {
    async get<T = unknown>(key: string): Promise<T | undefined> {
      const raw = readSetting(`${STORAGE_PREFIX}${name}:${key}`);
      if (raw === undefined) return undefined;
      try {
        return JSON.parse(raw) as T;
      } catch {
        return undefined;
      }
    },
    async set(key: string, value: unknown): Promise<void> {
      writeSetting(`${STORAGE_PREFIX}${name}:${key}`, JSON.stringify(value));
    },
    async delete(key: string): Promise<void> {
      deleteSetting(`${STORAGE_PREFIX}${name}:${key}`);
    },
  };

  return {
    name,
    mode: "server",
    directory: process.env.FREESTYLE_DB_PATH
      ? path.dirname(process.env.FREESTYLE_DB_PATH)
      : process.cwd(),
    logger: createPluginLogger(createAppLogger(`plugin:${name}`)),
    settings,
    storage,
  };
}
