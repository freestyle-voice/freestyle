import { PluginRegistry } from "@freestyle/sdk";
import { loadAppPlugins, type ServerTarget } from "./loader.js";

export {
  FreestyleEventType,
  OutputMode,
  PipelineStage,
  parseAppContext,
} from "@freestyle/sdk";
export type { ServerTarget } from "./loader.js";

let registry: PluginRegistry = new PluginRegistry();
let initialized = false;

/**
 * Load and install the app (Electron main) plugin registry. Settings are read
 * from the server at `target` over HTTP (the server owns the database, which
 * may be remote). Safe to call once at startup; later calls are ignored.
 * Failures degrade to an empty registry so output delivery always works.
 */
export async function initAppPlugins(target: ServerTarget): Promise<void> {
  if (initialized) return;
  initialized = true;
  try {
    registry = await loadAppPlugins(target);
  } catch {
    registry = new PluginRegistry();
  }
}

/** The active registry. Returns an empty one before init runs. */
export function plugins(): PluginRegistry {
  return registry;
}
