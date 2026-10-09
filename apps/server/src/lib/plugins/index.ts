import { createAppLogger } from "@freestyle-voice/utils";
import type { Plugin, PluginConfig } from "freestyle-voice";
import { PluginRegistry } from "freestyle-voice";
import { assertDatabaseOwner, assertServerCaller } from "../db-ownership.js";
import { boundedCleanup } from "../server-lifecycle.js";
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
  assertDatabaseOwner();
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
 * Contributed `middleware` also takes effect immediately: the app dispatches
 * plugin middleware from this live registry per request (see
 * `pluginMiddlewareDispatcher` in `apps/server/src/index.ts`), so a
 * newly-enabled plugin's routes become reachable and a disabled plugin's stop
 * responding on the next request — no restart required.
 */
export async function reloadServerPlugins(): Promise<void> {
  assertDatabaseOwner();
  const previous = registry;
  try {
    await loadIntoRegistry();
  } finally {
    if (previous !== registry) await previous.dispose().catch(() => {});
  }
  assertDatabaseOwner();
}

async function disposeUnusedRegistry(candidate: PluginRegistry): Promise<void> {
  // A superseded async load may finish after another server has installed its
  // registry. Dispose only the captured candidate, never the live successor.
  if (candidate === registry) return;
  await boundedCleanup(() => candidate.dispose(), "Discarded plugins").catch(
    () => {},
  );
}

async function loadIntoRegistry(): Promise<void> {
  assertDatabaseOwner();
  let candidate: PluginRegistry | undefined;
  try {
    candidate = await loadServerPlugins(builtinPlugins);
    assertDatabaseOwner();
    const config = await candidate.resolveConfig({});
    assertDatabaseOwner();
    if (Object.keys(config).length > 0) {
      log.info(`plugin config resolved: ${JSON.stringify(config)}`);
    }
    // Commit together only after loading/configuration and ownership validation.
    registry = candidate;
    resolvedConfig = config;
  } catch {
    if (candidate) await disposeUnusedRegistry(candidate);
    // A stale failure must not clear the successor's registry/config either.
    assertDatabaseOwner();
    registry = new PluginRegistry();
    resolvedConfig = {};
  }
}

/** The active registry. Returns an empty one before init runs. */
export function plugins(): PluginRegistry {
  assertDatabaseOwner();
  return registry;
}

/** The configuration contributed by plugins' `config` hooks at boot. */
export function pluginConfig(): PluginConfig {
  assertDatabaseOwner();
  return resolvedConfig;
}

/** Run every plugin's `dispose` hook (best-effort, on shutdown). */
export function disposeServerPlugins(): Promise<void> {
  assertServerCaller();
  initialized = false;
  return registry.dispose();
}
