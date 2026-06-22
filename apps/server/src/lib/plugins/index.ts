import type { AppContext } from "@freestyle/sdk";
import { parseAppContextPayload } from "../editor/app-context.js";
import { loadServerPlugins } from "./loader.js";
import { PluginRegistry } from "./registry.js";

export { PluginRegistry } from "./registry.js";

let registry: PluginRegistry = new PluginRegistry();
let initialized = false;

/**
 * Load and install the server plugin registry. Safe to call once at boot; later
 * calls are ignored. Failures degrade to an empty registry so the dictation
 * pipeline always works.
 */
export async function initServerPlugins(): Promise<void> {
  if (initialized) return;
  initialized = true;
  try {
    registry = await loadServerPlugins();
  } catch {
    registry = new PluginRegistry();
  }
}

/** The active registry. Returns an empty one before init runs. */
export function plugins(): PluginRegistry {
  return registry;
}

/**
 * Parse the raw app-context JSON the client sends (see transcribe route) into
 * the SDK's {@link AppContext} shape handed to hooks. Tolerant of missing or
 * malformed input.
 */
export function parseAppContext(raw: string | null): AppContext | undefined {
  const ctx = parseAppContextPayload(raw);
  if (!ctx) return undefined;

  const result: AppContext = {};
  if (ctx.app) result.appName = ctx.app;
  const windowTitle = ctx.windowTitle ?? ctx.title;
  if (windowTitle) result.windowTitle = windowTitle;
  if (ctx.url) result.url = ctx.url;
  if (ctx.bundleId) result.bundleId = ctx.bundleId;
  return result;
}
