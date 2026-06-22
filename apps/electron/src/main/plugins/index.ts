import type { AppContext } from "@freestyle/sdk";
import { PluginRegistry } from "@freestyle/sdk";
import { loadAppPlugins } from "./loader.js";

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

/**
 * Parse the app-context payload the renderer captured (the frontmost app/window
 * JSON, or a bare app-name string) into the SDK's {@link AppContext} shape.
 * Tolerant of missing or malformed input.
 */
export function parseAppContext(raw: string | null): AppContext | undefined {
  if (!raw) return undefined;

  let payload: {
    app?: string;
    url?: string;
    title?: string;
    windowTitle?: string;
    bundleId?: string;
  };
  try {
    payload = JSON.parse(raw);
  } catch {
    // Older/simple captures send a bare application name rather than JSON.
    return { appName: raw };
  }

  const result: AppContext = {};
  if (payload.app) result.appName = payload.app;
  const windowTitle = payload.windowTitle ?? payload.title;
  if (windowTitle) result.windowTitle = windowTitle;
  if (payload.url) result.url = payload.url;
  if (payload.bundleId) result.bundleId = payload.bundleId;
  return result;
}
