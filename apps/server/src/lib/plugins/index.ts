import { createAppLogger } from "@freestyle-voice/utils";
import type { Plugin, PluginConfig } from "freestyle-voice";
import { PluginRegistry } from "freestyle-voice";
import { loadServerPlugins } from "./loader.js";

export {
  FreestyleEventType,
  PipelineStage,
  parseAppContext,
} from "freestyle-voice";

const log = createAppLogger("plugins");

let registry: PluginRegistry = new PluginRegistry();
let resolvedConfig: PluginConfig = {};
let initialized = false;
let builtinPlugins: Plugin[] = [];

/**
 * Load and install the server plugin registry, then run the `config` hook
 * chain once so plugins can contribute boot-time configuration. Safe to call
 * once at boot; later calls are ignored. Failures degrade to an empty registry
 * so the dictation pipeline always works.
 *
 * Built-in plugins are always present and cannot be disabled by users. There
 * are currently none — cleanup preferences travel in the v2 request payload,
 * so the previous cloud-sync plugin is no longer needed.
 */
export async function initServerPlugins(): Promise<void> {
  if (initialized) return;
  initialized = true;
  builtinPlugins = [];
  await loadIntoRegistry();
}

/**
 * Reload the server plugin registry from the current `plugins`/`disabled_plugins`
 * settings. Used when a plugin is enabled/disabled at runtime: the old
 * registry is disposed and a fresh one is built so disabled plugins' hooks stop
 * firing immediately, without a server restart.
 *
 * Note: plugin middleware is mounted at app construction time and is NOT
 * updated by a reload. Only hook handlers are affected. Middleware changes
 * require a full server restart.
 */
export async function reloadServerPlugins(): Promise<void> {
  const previous = registry;
  await loadIntoRegistry();
  await previous.dispose().catch(() => {});
}

async function loadIntoRegistry(): Promise<void> {
  try {
    registry = await loadServerPlugins(builtinPlugins);
    resolvedConfig = await registry.resolveConfig({});
    if (Object.keys(resolvedConfig).length > 0) {
      log.info(`plugin config resolved: ${JSON.stringify(resolvedConfig)}`);
    }
  } catch {
    registry = new PluginRegistry();
    resolvedConfig = {};
  }
}

/** The active registry. Returns an empty one before init runs. */
export function plugins(): PluginRegistry {
  return registry;
}

/** The configuration contributed by plugins' `config` hooks at boot. */
export function pluginConfig(): PluginConfig {
  return resolvedConfig;
}

/** Run every plugin's `dispose` hook (best-effort, on shutdown). */
export function disposeServerPlugins(): Promise<void> {
  return registry.dispose();
}
