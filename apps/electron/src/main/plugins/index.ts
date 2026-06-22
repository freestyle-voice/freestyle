import { PluginRegistry } from "@freestyle/sdk";
import { loadAppPlugins } from "./loader.js";

export { parseAppContext } from "@freestyle/sdk";

let registry: PluginRegistry = new PluginRegistry();
let initialized = false;

/**
 * Load and install the app (Electron main) plugin registry. Safe to call once
 * at startup; later calls are ignored. Failures degrade to an empty registry so
 * output delivery always works.
 */
export async function initAppPlugins(): Promise<void> {
  if (initialized) return;
  initialized = true;
  try {
    registry = await loadAppPlugins();
  } catch {
    registry = new PluginRegistry();
  }
}

/** The active registry. Returns an empty one before init runs. */
export function plugins(): PluginRegistry {
  return registry;
}
