import path from "node:path";
import { createAppLogger } from "@freestyle-voice/utils";
import type {
  PluginContext,
  PluginLlm,
  PluginStorage,
  SettingsReader,
} from "freestyle-voice";
import { createPluginLogger } from "freestyle-voice";
import { deleteSetting, readSetting, writeSetting } from "../db.js";
import { getGroqChatModel } from "../groq-http.js";
import { createChatModel, getDefaultModels } from "../providers.js";

const STORAGE_PREFIX = "plugin:";

/**
 * Build the {@link PluginLlm} capability from the user's default LLM model, or
 * return `undefined` when none is configured. The resolved model reuses the
 * same provider/key selection as built-in cleanup (including the groq HTTP
 * shim), so plugins never manage their own credentials.
 */
function buildPluginLlm(): PluginLlm | undefined {
  const llm = getDefaultModels().llm;
  if (!llm) return undefined;
  return {
    providerId: llm.provider,
    modelId: llm.model_id,
    // Resolve the model lazily and live, so a changed default (or rotated key)
    // is picked up without needing the plugin to be reloaded.
    getModel: () => {
      const current = getDefaultModels().llm ?? llm;
      return current.provider === "groq"
        ? getGroqChatModel(current.model_id)
        : createChatModel(current.provider, current.model_id);
    },
  };
}

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

  const llm = buildPluginLlm();

  return {
    name,
    mode: "server",
    directory: process.env.FREESTYLE_DB_PATH
      ? path.dirname(process.env.FREESTYLE_DB_PATH)
      : process.cwd(),
    logger: createPluginLogger(createAppLogger(`plugin:${name}`)),
    settings,
    storage,
    ...(llm ? { llm } : {}),
  };
}
