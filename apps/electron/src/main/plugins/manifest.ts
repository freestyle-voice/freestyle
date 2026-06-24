import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  type PluginUIPage,
  parsePluginIcon,
  parsePluginPages,
  pluginSlug,
} from "@freestyle/sdk";
import { createAppLogger } from "@freestyle/utils";
import { parsePluginsSetting, pluginEntryParts } from "@freestyle/validations";

const log = createAppLogger("plugins-ui");

/** A discovered plugin and (if it ships any) its UI pages. */
export interface DiscoveredPlugin {
  /** The package name from its `package.json` (or the local file name). */
  name: string;
  /**
   * A URL- and route-safe identifier derived from {@link name}. Used as the
   * `freestyle-plugin://` host and the `/plugins/:slug/...` route segment, since
   * package names can contain `@` and `/` which are unsafe in both.
   */
  slug: string;
  /** The install/specifier the plugin was discovered from. */
  specifier: string;
  /** Absolute path to the plugin package root (the dir holding package.json). */
  dir: string;
  /** Version from `package.json`, when present. */
  version?: string;
  /** Human-readable description from `package.json`, when present. */
  description?: string;
  /** Author string from `package.json`, when present. */
  author?: string;
  /** Icon name (lucide) the plugin declares via `freestyle.icon`, if any. */
  icon?: string;
  /** Whether this is a local-dir plugin (vs an installed package). */
  local: boolean;
  /** Whether the plugin is currently enabled (not in `disabled_plugins`). */
  enabled: boolean;
  /** Raw README markdown read from the package dir, when present. */
  readme?: string;
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
  disabled: ReadonlySet<string> = new Set(),
): DiscoveredPlugin[] {
  const out: DiscoveredPlugin[] = [];
  const seenDirs = new Set<string>();

  const localPluginsDir = path.join(userDataDir, "plugins");
  const entries = parsePluginsSetting(pluginsSetting);

  for (const entry of entries) {
    const { specifier } = pluginEntryParts(entry);
    const discovered = discoverPackage(specifier, localPluginsDir);
    if (discovered && !seenDirs.has(discovered.dir)) {
      seenDirs.add(discovered.dir);
      discovered.enabled = !disabled.has(discovered.specifier);
      out.push(discovered);
    }
  }

  // Also surface packages dropped directly into the local plugins dir that
  // aren't listed in the `plugins` setting (manual installs).
  for (const local of discoverLocalDir(localPluginsDir)) {
    if (!seenDirs.has(local.dir)) {
      seenDirs.add(local.dir);
      local.enabled = !disabled.has(local.specifier);
      out.push(local);
    }
  }

  return out;
}

/**
 * Resolve an installed package specifier to a {@link DiscoveredPlugin}. Tries
 * Node/workspace resolution first, then the local plugins dir (where the
 * installer materializes downloaded packages, keyed by {@link pluginSlug}).
 */
function discoverPackage(
  specifier: string,
  localPluginsDir: string,
): DiscoveredPlugin | null {
  const pkgJsonPath = resolvePackageJson(specifier);
  if (pkgJsonPath) return readManifest(pkgJsonPath, specifier, false);

  const localPkgJson = path.join(
    localPluginsDir,
    pluginSlug(specifier),
    "package.json",
  );
  if (fs.existsSync(localPkgJson)) {
    return readManifest(localPkgJson, specifier, true);
  }

  log.warn(`could not resolve plugin package "${specifier}"`);
  return null;
}

/**
 * Resolve a package's `package.json`. First tries Node resolution from several
 * base paths (a bundled Electron main has an unpredictable `import.meta.url`,
 * and the plugin may live in the app's `node_modules`). Falls back to scanning
 * the monorepo's `plugins/` workspace by package name, so first-party plugins
 * resolve in dev even before `pnpm install` links them into `node_modules`.
 */
function resolvePackageJson(specifier: string): string | null {
  const target = `${specifier}/package.json`;
  const bases = [
    import.meta.url,
    pathToFileURL(path.join(__dirname, "index.js")).href,
    pathToFileURL(path.join(process.cwd(), "index.js")).href,
  ];
  for (const base of bases) {
    try {
      return createRequire(base).resolve(target);
    } catch {
      // try the next base
    }
  }
  return resolveFromWorkspace(specifier);
}

/**
 * Locate a package by name inside the monorepo's `plugins/` directory. Only
 * relevant in a dev checkout; returns `null` in a packaged app where there is
 * no workspace.
 */
function resolveFromWorkspace(specifier: string): string | null {
  // out/main/index.js -> apps/electron -> <repo root>
  const repoRoot = path.resolve(__dirname, "../../../..");
  const pluginsDir = path.join(repoRoot, "plugins");
  let names: string[];
  try {
    names = fs.readdirSync(pluginsDir);
  } catch {
    return null;
  }
  for (const name of names) {
    const pkgJsonPath = path.join(pluginsDir, name, "package.json");
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8")) as {
        name?: unknown;
      };
      if (pkg.name === specifier) return pkgJsonPath;
    } catch {
      // not a readable package; skip
    }
  }
  return null;
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
    // Use the package's own name as the specifier so enable/disable (keyed by
    // specifier in `disabled_plugins`) matches, rather than the dir path.
    const pkgName = readPackageName(pkgJsonPath) ?? full;
    const discovered = readManifest(pkgJsonPath, pkgName, true);
    if (discovered) out.push(discovered);
  }
  return out;
}

/** Read just the `name` field from a package.json, or `null` if unreadable. */
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
  const name = typeof pkg.name === "string" ? pkg.name : path.basename(dir);
  const icon = parsePluginIcon(pkg.freestyle);
  const readme = readReadme(dir);
  return {
    name,
    slug: pluginSlug(name),
    specifier,
    dir,
    local,
    enabled: true,
    pages: parsePluginPages(pkg.freestyle),
    ...(typeof pkg.version === "string" ? { version: pkg.version } : {}),
    ...(typeof pkg.description === "string"
      ? { description: pkg.description }
      : {}),
    ...(typeof pkg.author === "string" ? { author: pkg.author } : {}),
    ...(icon ? { icon } : {}),
    ...(readme ? { readme } : {}),
  };
}

/** Read a plugin's README markdown from its package dir, if present. */
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

/**
 * Resolve and validate a request for a plugin's UI asset to an absolute file
 * path *inside that plugin's directory*. Returns `null` when the plugin is
 * unknown or the resolved path escapes the plugin root (path-traversal guard).
 */
export function resolvePluginAsset(
  plugins: readonly DiscoveredPlugin[],
  pluginSlug: string,
  assetPath: string,
): string | null {
  const plugin = plugins.find((p) => p.slug === pluginSlug);
  if (!plugin) return null;

  const decoded = decodeURIComponent(assetPath).replace(/^\/+/, "");
  const resolved = path.resolve(plugin.dir, decoded);
  const root = path.resolve(plugin.dir);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    return null;
  }
  return resolved;
}
