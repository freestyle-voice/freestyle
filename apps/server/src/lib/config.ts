/**
 * Freestyle config file — `config.freestyle.json` in the same directory as the
 * SQLite database (userData). Stores experimental feature flags and other
 * non-settings configuration that doesn't belong in the DB.
 *
 * Shape:
 * ```json
 * {
 *   "flags": {
 *     "streaming_audio": true
 *   }
 * }
 * ```
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createAppLogger } from "@freestyle-voice/utils";

const log = createAppLogger("config");

const CONFIG_FILENAME = "config.freestyle.json";

interface FreestyleConfig {
  flags: Record<string, boolean>;
}

let cachedConfig: FreestyleConfig | null = null;
let configPath: string | null = null;

function resolveConfigPath(): string | null {
  if (configPath) return configPath;
  const dbPath = process.env.FREESTYLE_DB_PATH;
  if (!dbPath) return null;
  configPath = join(dirname(dbPath), CONFIG_FILENAME);
  return configPath;
}

function defaultConfig(): FreestyleConfig {
  return { flags: {} };
}

/** Load the config file from disk (or return the cached copy). */
export function loadConfig(): FreestyleConfig {
  if (cachedConfig) return cachedConfig;

  const path = resolveConfigPath();
  if (!path) {
    cachedConfig = defaultConfig();
    return cachedConfig;
  }

  try {
    const raw = readFileSync(path, "utf-8");
    const parsed = JSON.parse(raw) as Partial<FreestyleConfig>;
    cachedConfig = {
      flags:
        parsed.flags && typeof parsed.flags === "object" ? parsed.flags : {},
    };
  } catch {
    // File doesn't exist yet or is malformed — start fresh.
    cachedConfig = defaultConfig();
  }
  return cachedConfig;
}

/** Persist the current config to disk. */
function saveConfig(config: FreestyleConfig): void {
  const path = resolveConfigPath();
  if (!path) return;

  try {
    writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`, "utf-8");
  } catch (err) {
    log.error(
      `Failed to write ${CONFIG_FILENAME}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/** Read a single flag (defaults to `false` if unset). */
export function getFlag(key: string): boolean {
  return loadConfig().flags[key] === true;
}

/** Set a flag and persist to disk. */
export function setFlag(key: string, value: boolean): void {
  const config = loadConfig();
  config.flags[key] = value;
  cachedConfig = config;
  saveConfig(config);
}

/** Return all flags as a plain object. */
export function getFlags(): Record<string, boolean> {
  return { ...loadConfig().flags };
}
