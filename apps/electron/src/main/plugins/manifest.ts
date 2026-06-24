import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { type PluginUIPage, parsePluginPages } from "@freestyle/sdk";
import { createAppLogger } from "@freestyle/utils";
import { parsePluginsSetting, pluginEntryParts } from "@freestyle/validations";

const log = createAppLogger("plugins-ui");

const require = createRequire(import.meta.url);

/** A discovered plugin and (if it ships any) its UI pages. */
export interface DiscoveredPlugin {
  /** The package name from its `package.json` (or the local file name). */
  name: string;
  /** The install/specifier the plugin was discovered from. */
  specifier: string;
  /** Absolute path to the plugin package root (the dir holding package.json). */
  dir: string;
  /** Human-readable description from `package.json`, when present. */
  description?: string;
  /** Author string from `package.json`, when present. */
  author?: string;
  /** Whether this is a local-dir plugin (vs an installed package). */
  local: boolean;
  /** UI pages the plugin contributes. */
  pages: PluginUIPage[];
}

/**
 * Discover all installed plugins and their UI contributions for the renderer's
 * Plugins hub. Reads the same sources the hook loader uses — npm/module
 * specifiers from the `plugins` setting, then local files in
 * `<userData>/plugins/` — but only inspects each plugin's `package.json`
 * manifest; it never executes plugin code.
 */
export function discoverPlugins(
  pluginsSetting: string | undefined,
  userDataDir: string,
): DiscoveredPlugin[] {
  const out: DiscoveredPlugin[] = [];
  const seenDirs = new Set<string>();

  for (const entry of parsePluginsSetting(pluginsSetting)) {
    const { specifier } = pluginEntryParts(entry);
    const discovered = discoverPackage(specifier);
    if (discovered && !seenDirs.has(discovered.dir)) {
      seenDirs.add(discovered.dir);
      out.push(discovered);
    }
  }

  for (const local of discoverLocalDir(path.join(userDataDir, "plugins"))) {
    if (!seenDirs.has(local.dir)) {
      seenDirs.add(local.dir);
      out.push(local);
    }
  }

  return out;
}

/** Resolve an installed package specifier to a {@link DiscoveredPlugin}. */
function discoverPackage(specifier: string): DiscoveredPlugin | null {
  let pkgJsonPath: string;
  try {
    pkgJsonPath = require.resolve(`${specifier}/package.json`);
  } catch {
    log.warn(`could not resolve plugin package "${specifier}"`);
    return null;
  }
  return readManifest(pkgJsonPath, specifier, false);
}

/** Discover local plugin files/folders under `<userData>/plugins/`. */
function discoverLocalDir(dir: string): DiscoveredPlugin[] {
  let names: string[];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return [];
  }

  const out: DiscoveredPlugin[] = [];
  for (const name of names) {
    const full = path.join(dir, name);
    const pkgJsonPath = path.join(full, "package.json");
    if (!fs.existsSync(pkgJsonPath)) continue;
    const discovered = readManifest(pkgJsonPath, full, true);
    if (discovered) out.push(discovered);
  }
  return out;
}

interface RawPackageJson {
  name?: unknown;
  description?: unknown;
  author?: unknown;
  freestyle?: unknown;
}

/** Read and validate a plugin's `package.json` into a {@link DiscoveredPlugin}. */
function readManifest(
  pkgJsonPath: string,
  specifier: string,
  local: boolean,
): DiscoveredPlugin | null {
  let pkg: RawPackageJson;
  try {
    pkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8")) as RawPackageJson;
  } catch (err) {
    log.warn(
      `failed to read plugin manifest "${pkgJsonPath}": ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return null;
  }

  const dir = path.dirname(pkgJsonPath);
  return {
    name: typeof pkg.name === "string" ? pkg.name : path.basename(dir),
    specifier,
    dir,
    local,
    pages: parsePluginPages(pkg.freestyle),
    ...(typeof pkg.description === "string"
      ? { description: pkg.description }
      : {}),
    ...(typeof pkg.author === "string" ? { author: pkg.author } : {}),
  };
}

/**
 * Resolve and validate a request for a plugin's UI asset to an absolute file
 * path *inside that plugin's directory*. Returns `null` when the plugin is
 * unknown or the resolved path escapes the plugin root (path-traversal guard).
 */
export function resolvePluginAsset(
  plugins: readonly DiscoveredPlugin[],
  pluginName: string,
  assetPath: string,
): string | null {
  const plugin = plugins.find((p) => p.name === pluginName);
  if (!plugin) return null;

  const decoded = decodeURIComponent(assetPath).replace(/^\/+/, "");
  const resolved = path.resolve(plugin.dir, decoded);
  const root = path.resolve(plugin.dir);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    return null;
  }
  return resolved;
}
