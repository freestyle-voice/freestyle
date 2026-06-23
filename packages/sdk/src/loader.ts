import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { PluginContext } from "./context.js";
import { sortPlugins } from "./order.js";
import type {
  Plugin,
  PluginFactory,
  PluginModule,
  PluginPreset,
} from "./plugin.js";
import { type HookFailure, PluginRegistry } from "./registry.js";

const LOCAL_PLUGIN_EXTS = [".ts", ".js", ".mjs"];

/**
 * List loadable plugin files in a directory, sorted by name (stable load order).
 * Returns absolute paths; missing/unreadable directories yield an empty list.
 */
export function discoverLocalPlugins(dir: string): string[] {
  let names: string[];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return [];
  }
  return names
    .filter((name) => LOCAL_PLUGIN_EXTS.includes(path.extname(name)))
    .filter((name) => !name.endsWith(".d.ts"))
    .sort()
    .map((name) => path.join(dir, name));
}

/**
 * The default local plugins directory: `<userData>/plugins/`, derived from the
 * `FREESTYLE_DB_PATH` the host sets at startup. Returns `null` when the path is
 * unset (e.g. a remote-server configuration with no local database).
 */
export function defaultLocalPluginsDir(): string | null {
  const dbPath = process.env.FREESTYLE_DB_PATH;
  if (!dbPath) return null;
  return path.join(path.dirname(dbPath), "plugins");
}

/** A resolved plugin entry: a module specifier plus optional options. */
export interface PluginEntry {
  specifier: string;
  options?: Record<string, unknown>;
}

/** Minimal logger the loader uses for diagnostics. */
export interface LoaderLogger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export interface LoadPluginsOptions {
  /**
   * npm / module specifier entries (from the `plugins` setting), in load order.
   * Loaded before local files.
   */
  entries?: PluginEntry[];
  /**
   * Absolute paths to local plugin files, in load order. Loaded after entries.
   * Mutually combinable with `localDir` (files first, then directory contents).
   */
  localFiles?: string[];
  /**
   * A directory to auto-discover local plugin files from (sorted by name).
   * Convenience over passing `localFiles` from {@link discoverLocalPlugins}.
   */
  localDir?: string;
  /** Build the context handed to a plugin's `setup` hook. */
  buildContext: (name: string) => PluginContext;
  /** Diagnostics logger. */
  logger: LoaderLogger;
  /** Routes hook-handler failures (passed through to the registry). */
  onError?: (failure: HookFailure) => void;
}

/**
 * Discover, instantiate, set up, and order plugins, returning a ready-to-use
 * {@link PluginRegistry}. Host-agnostic: callers inject the entry list, local
 * files, context builder, and logger. Both the server and the Electron main
 * process use this. Every plugin is loaded; each hook only runs in the host
 * that invokes it, so no host filtering happens here.
 *
 * Order of operations: entries (in order) → local files (in order) → flatten
 * presets / drop falsy → run `setup` in load order → sort by `enforce`
 * (stable).
 */
export async function loadPlugins(
  options: LoadPluginsOptions,
): Promise<PluginRegistry> {
  const { buildContext, logger, onError } = options;
  const resolved: Plugin[] = [];

  for (const entry of options.entries ?? []) {
    const factory = await importFactory(entry.specifier, logger);
    if (factory) {
      collect(
        resolved,
        safeInvoke(factory, entry.specifier, logger, entry.options),
      );
    }
  }

  const localFiles = [
    ...(options.localFiles ?? []),
    ...(options.localDir ? discoverLocalPlugins(options.localDir) : []),
  ];
  for (const file of localFiles) {
    const factory = await importFactory(file, logger);
    if (factory) collect(resolved, safeInvoke(factory, file, logger));
  }

  for (const plugin of resolved) {
    if (!plugin.setup) continue;
    try {
      await plugin.setup(buildContext(plugin.name));
    } catch (err) {
      logger.error(`plugin "${plugin.name}" setup failed: ${errMessage(err)}`);
    }
  }

  const ordered = sortPlugins(resolved);
  if (ordered.length > 0) {
    logger.info(
      `loaded ${ordered.length} plugin(s): ${ordered.map((p) => p.name).join(", ")}`,
    );
  }
  return new PluginRegistry(ordered, { onError });
}

/** Push a plugin/preset/falsy result into the accumulator, flattening arrays. */
function collect(acc: Plugin[], result: PluginPreset): void {
  if (!result) return;
  if (Array.isArray(result)) {
    for (const plugin of result) {
      if (plugin) acc.push(plugin);
    }
    return;
  }
  acc.push(result);
}

function safeInvoke(
  factory: PluginFactory,
  source: string,
  logger: LoaderLogger,
  options?: Record<string, unknown>,
): PluginPreset {
  try {
    return factory(options);
  } catch (err) {
    logger.error(`plugin factory from "${source}" threw: ${errMessage(err)}`);
    return undefined;
  }
}

/**
 * Import a module and return its plugin factory. Only the **default export** is
 * treated as a factory (Vite convention); this avoids accidentally invoking
 * unrelated named helper exports or re-exports as if they were plugins.
 */
async function importFactory(
  specifier: string,
  logger: LoaderLogger,
): Promise<PluginFactory | null> {
  let mod: PluginModule;
  try {
    const url = specifier.includes("://")
      ? specifier
      : path.isAbsolute(specifier)
        ? pathToFileURL(specifier).href
        : specifier;
    mod = (await dynamicImport(url)) as PluginModule;
  } catch (err) {
    logger.error(`failed to import plugin "${specifier}": ${errMessage(err)}`);
    return null;
  }

  if (typeof mod.default !== "function") {
    logger.warn(`plugin "${specifier}" has no default export factory function`);
    return null;
  }
  return mod.default;
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Runtime dynamic import of an arbitrary plugin specifier. Plugins are user
 * code loaded from disk or npm at runtime, so the target is inherently dynamic;
 * the indirection keeps bundlers from attempting (and warning about) static
 * analysis of the import target.
 */
const dynamicImport: (url: string) => Promise<unknown> = new Function(
  "url",
  "return import(url)",
) as (url: string) => Promise<unknown>;
