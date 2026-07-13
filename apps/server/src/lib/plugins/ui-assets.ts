import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { createAppLogger } from "@freestyle-voice/utils";
import {
  parseDisabledPlugins,
  parsePluginsSetting,
  pluginEntryParts,
} from "@freestyle-voice/validations";
import {
  defaultLocalPluginsDir,
  type PluginUIPage,
  parsePluginDisplayName,
  parsePluginIcon,
  parsePluginPages,
  pluginSlug,
} from "freestyle-voice";
import { readSetting } from "../db.js";

const log = createAppLogger("plugins-ui");

/** A discovered plugin and (if it ships any) its UI pages, for the hub. */
export interface DiscoveredPlugin {
  name: string;
  slug: string;
  specifier: string;
  /** Absolute path to the plugin package root. Server-internal; not serialized. */
  dir: string;
  version?: string;
  description?: string;
  author?: string;
  displayName?: string;
  icon?: string;
  enabled: boolean;
  missing?: boolean;
  readme?: string;
  pages: PluginUIPage[];
}

/**
 * Discover all installed plugins and their UI contributions, reading the same
 * sources the hook loader uses — npm/module specifiers from the `plugins`
 * setting, then packages materialized in `<userData>/plugins/`. Only inspects
 * each plugin's `package.json` manifest; never executes plugin code.
 *
 * This is the server-side successor to the old Electron `discoverPlugins`:
 * hosting moved server-side so plugin UI is served over the loopback origin
 * instead of a custom `freestyle-plugin://` scheme.
 */
export function discoverPlugins(): DiscoveredPlugin[] {
  const disabled = new Set(
    parseDisabledPlugins(readSetting("disabled_plugins")),
  );
  const localPluginsDir = defaultLocalPluginsDir();
  const out: DiscoveredPlugin[] = [];
  const seenDirs = new Set<string>();

  for (const entry of parsePluginsSetting(readSetting("plugins"))) {
    const { specifier } = pluginEntryParts(entry);
    const discovered = discoverPackage(specifier, localPluginsDir);
    if (!discovered) {
      out.push(missingPlugin(specifier, !disabled.has(specifier)));
      continue;
    }
    if (!seenDirs.has(discovered.dir)) {
      seenDirs.add(discovered.dir);
      discovered.enabled = !disabled.has(discovered.specifier);
      out.push(discovered);
    }
  }

  // Packages dropped directly into the local plugins dir that aren't listed in
  // the `plugins` setting (manual installs).
  if (localPluginsDir) {
    for (const local of discoverLocalDir(localPluginsDir)) {
      if (!seenDirs.has(local.dir)) {
        seenDirs.add(local.dir);
        local.enabled = !disabled.has(local.specifier);
        out.push(local);
      }
    }
  }

  return out;
}

function discoverPackage(
  specifier: string,
  localPluginsDir: string | null,
): DiscoveredPlugin | null {
  const pkgJsonPath = resolvePackageJson(specifier);
  if (pkgJsonPath) return readManifest(pkgJsonPath, specifier);

  if (localPluginsDir) {
    const localPkgJson = path.join(
      localPluginsDir,
      pluginSlug(specifier),
      "package.json",
    );
    if (fs.existsSync(localPkgJson)) {
      return readManifest(localPkgJson, specifier);
    }
  }

  return null;
}

function missingPlugin(specifier: string, enabled: boolean): DiscoveredPlugin {
  return {
    name: specifier,
    slug: pluginSlug(specifier),
    specifier,
    dir: "",
    enabled,
    missing: true,
    pages: [],
  };
}

/**
 * Resolve a package's `package.json` via Node resolution. The plugin may live
 * in the server's `node_modules`; returns `null` when unresolved, so the caller
 * falls back to the local plugins dir.
 */
function resolvePackageJson(specifier: string): string | null {
  const target = `${specifier}/package.json`;
  const bases = [import.meta.url, path.join(process.cwd(), "index.js")];
  for (const base of bases) {
    try {
      return createRequire(base).resolve(target);
    } catch {
      // try the next base
    }
  }
  return null;
}

function discoverLocalDir(dir: string): DiscoveredPlugin[] {
  let names: string[];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return [];
  }

  const out: DiscoveredPlugin[] = [];
  for (const name of names) {
    // Skip dotfiles, including the installer's transient `.<slug>-*` staging dirs.
    if (name.startsWith(".")) continue;
    const full = path.join(dir, name);
    const pkgJsonPath = path.join(full, "package.json");
    if (!fs.existsSync(pkgJsonPath)) continue;
    const pkgName = readPackageName(pkgJsonPath) ?? full;
    const discovered = readManifest(pkgJsonPath, pkgName);
    if (discovered) out.push(discovered);
  }
  return out;
}

function readPackageName(pkgJsonPath: string): string | null {
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8")) as {
      name?: unknown;
    };
    return typeof pkg.name === "string" && pkg.name ? pkg.name : null;
  } catch {
    return null;
  }
}

interface RawPackageJson {
  name?: unknown;
  version?: unknown;
  description?: unknown;
  author?: unknown;
  freestyle?: unknown;
}

function readManifest(
  pkgJsonPath: string,
  specifier: string,
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
  const name = typeof pkg.name === "string" ? pkg.name : path.basename(dir);
  const displayName = parsePluginDisplayName(pkg.freestyle);
  const icon = parsePluginIcon(pkg.freestyle);
  const readme = readReadme(dir);
  return {
    name,
    slug: pluginSlug(name),
    specifier,
    dir,
    enabled: true,
    pages: parsePluginPages(pkg.freestyle),
    ...(typeof pkg.version === "string" ? { version: pkg.version } : {}),
    ...(typeof pkg.description === "string"
      ? { description: pkg.description }
      : {}),
    ...(typeof pkg.author === "string" ? { author: pkg.author } : {}),
    ...(displayName ? { displayName } : {}),
    ...(icon ? { icon } : {}),
    ...(readme ? { readme } : {}),
  };
}

function readReadme(dir: string): string | undefined {
  let names: string[];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return undefined;
  }
  const match = names.find((n) => /^readme(\.(md|markdown|txt))?$/i.test(n));
  if (!match) return undefined;
  try {
    return fs.readFileSync(path.join(dir, match), "utf8");
  } catch {
    return undefined;
  }
}

/** The renderer-facing shape: the absolute `dir` is stripped. */
export type SerializedPlugin = Omit<DiscoveredPlugin, "dir">;

/** Serialize discovered plugins for the hub, dropping the server-local `dir`. */
export function serializePlugins(
  plugins: readonly DiscoveredPlugin[],
): SerializedPlugin[] {
  return plugins.map(({ dir: _dir, ...rest }) => rest);
}

/**
 * Resolve and validate a request for a plugin's UI asset to an absolute file
 * path *inside that plugin's directory*. Returns `null` when the plugin is
 * unknown or the resolved path escapes the plugin root (path-traversal guard).
 */
export function resolvePluginAsset(
  plugins: readonly DiscoveredPlugin[],
  slug: string,
  assetPath: string,
): string | null {
  const plugin = plugins.find((p) => p.slug === slug);
  // A missing plugin has no directory (`dir: ""`); resolving against it would
  // fall back to `process.cwd()` and could leak files from the server root.
  if (!plugin?.dir) return null;

  const decoded = decodeURIComponent(assetPath).replace(/^\/+/, "");
  const resolved = path.resolve(plugin.dir, decoded);
  const root = path.resolve(plugin.dir);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    return null;
  }
  return resolved;
}
