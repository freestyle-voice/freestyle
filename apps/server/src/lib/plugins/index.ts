import type { PluginConfig } from "@freestyle/sdk";
import { PluginRegistry } from "@freestyle/sdk";
import { createAppLogger } from "@freestyle/utils";
import { loadServerPlugins } from "./loader.js";

export {
  FreestyleEventType,
  PipelineStage,
  parseAppContext,
} from "@freestyle/sdk";

const log = createAppLogger("plugins");

let registry: PluginRegistry = new PluginRegistry();
let resolvedConfig: PluginConfig = {};
let initialized = false;

/**
 * Load and install the server plugin registry, then run the `config` hook
 * chain once so plugins can contribute boot-time configuration. Safe to call
 * once at boot; later calls are ignored. Failures degrade to an empty registry
 * so the dictation pipeline always works.
 */
export async function initServerPlugins(): Promise<void> {
  if (initialized) return;
  initialized = true;
  try {
    registry = await loadServerPlugins();
    resolvedConfig = await registry.resolveConfig({});
    if (Object.keys(resolvedConfig).length > 0) {
      log.info(`plugin config resolved: ${JSON.stringify(resolvedConfig)}`);
    }
  } catch {
    registry = new PluginRegistry();
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
