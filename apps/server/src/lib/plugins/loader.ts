import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type {
  Host,
  Plugin,
  PluginFactory,
  PluginModule,
  PluginPreset,
} from "@freestyle/sdk";
import { sortPlugins } from "@freestyle/sdk";
import { createAppLogger } from "@freestyle/utils";
import { parsePluginsSetting, pluginEntryParts } from "@freestyle/validations";
import { readSetting } from "../db.js";
import { buildPluginContext } from "./context.js";
import { PluginRegistry } from "./registry.js";

const log = createAppLogger("plugins");

const HOST: Host = "server";
const LOCAL_PLUGIN_EXTS = [".ts", ".js", ".mjs"];

/**
 * Discover, instantiate, host-filter, set up, and order all plugins for the
 * server process, returning a ready-to-use {@link PluginRegistry}.
 *
 * Sources, in load order:
 *  1. npm packages / module specifiers listed in the `plugins` setting.
 *  2. Local files in `<userData>/plugins/`.
 */
export async function loadServerPlugins(): Promise<PluginRegistry> {
  const dataDir = pluginsDataDir();
  const entries = parsePluginsSetting(readSetting("plugins"));

  const resolved: Plugin[] = [];

  // 1. npm / specifier entries (may carry options).
  for (const entry of entries) {
    const { specifier, options } = pluginEntryParts(entry);
    const factories = await importFactories(specifier);
    for (const factory of factories) {
      collect(resolved, safeInvoke(factory, specifier, options));
    }
  }

  // 2. Local files.
  if (dataDir) {
    for (const file of localPluginFiles(dataDir)) {
      const factories = await importFactories(file);
      for (const factory of factories) {
        collect(resolved, safeInvoke(factory, file));
      }
    }
  }

  // Host-filter via `apply`, then run setup, then order by `enforce`.
  const applicable = resolved.filter((plugin) => appliesToHost(plugin));
  for (const plugin of applicable) {
    if (!plugin.setup) continue;
    try {
      await plugin.setup(buildPluginContext(plugin.name));
    } catch (err) {
      log.error(`plugin "${plugin.name}" setup failed: ${errMessage(err)}`);
    }
  }

  const ordered = sortPlugins(applicable);
  if (ordered.length > 0) {
    log.info(
      `loaded ${ordered.length} plugin(s): ${ordered.map((p) => p.name).join(", ")}`,
    );
  }
  return new PluginRegistry(ordered);
}

function appliesToHost(plugin: Plugin): boolean {
  const apply = plugin.apply;
  if (apply === undefined) return true;
  if (typeof apply === "function") return apply({ host: HOST });
  return apply === HOST;
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
  options?: Record<string, unknown>,
): PluginPreset {
  try {
    return factory(options);
  } catch (err) {
    log.error(`plugin factory from "${source}" threw: ${errMessage(err)}`);
    return undefined;
  }
}

/**
 * Import a module and return its plugin factory. Only the **default export** is
 * treated as a factory (Vite convention); this avoids accidentally invoking
 * unrelated named helper exports or re-exports as if they were plugins.
 */
async function importFactories(specifier: string): Promise<PluginFactory[]> {
  let mod: PluginModule;
  try {
    const url = specifier.includes("://")
      ? specifier
      : path.isAbsolute(specifier)
        ? pathToFileURL(specifier).href
        : specifier;
    mod = (await dynamicImport(url)) as PluginModule;
  } catch (err) {
    log.error(`failed to import plugin "${specifier}": ${errMessage(err)}`);
    return [];
  }

  if (typeof mod.default !== "function") {
    log.warn(`plugin "${specifier}" has no default export factory function`);
    return [];
  }
  return [mod.default];
}

function localPluginFiles(dir: string): string[] {
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

/** `<userData>/plugins/`, derived from the db path the app sets at startup. */
function pluginsDataDir(): string | null {
  const dbPath = process.env.FREESTYLE_DB_PATH;
  if (!dbPath) return null;
  return path.join(path.dirname(dbPath), "plugins");
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Runtime dynamic import of an arbitrary plugin specifier. Plugins are user
 * code loaded from disk or npm at runtime, so the target is inherently dynamic;
 * the indirection keeps the bundler from attempting (and warning about) static
 * analysis of the import target.
 */
const dynamicImport: (url: string) => Promise<unknown> = new Function(
  "url",
  "return import(url)",
) as (url: string) => Promise<unknown>;
