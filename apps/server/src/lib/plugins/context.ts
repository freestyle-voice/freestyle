import path from "node:path";
import { createAppLogger } from "@freestyle-voice/utils";
import type { PluginContext, SettingsReader } from "freestyle-voice";
import { createPluginLogger } from "freestyle-voice";
import { readSetting } from "../db.js";

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
    mode: "server",
    directory: process.env.FREESTYLE_DB_PATH
      ? path.dirname(process.env.FREESTYLE_DB_PATH)
      : process.cwd(),
    logger: createPluginLogger(createAppLogger(`plugin:${name}`)),
    settings,
  };
}
