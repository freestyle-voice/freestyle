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
  /** Human-readable description from `package.json`, when present. */
  description?: string;
  /** Author string from `package.json`, when present. */
  author?: string;
  /** Icon name (lucide) the plugin declares via `freestyle.icon`, if any. */
  icon?: string;
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

  const entries = parsePluginsSetting(pluginsSetting);
  log.info(
    `discovery: plugins setting=${JSON.stringify(pluginsSetting ?? null)} (${entries.length} entr${entries.length === 1 ? "y" : "ies"})`,
  );

  for (const entry of entries) {
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
  const pkgJsonPath = resolvePackageJson(specifier);
  if (!pkgJsonPath) {
    log.warn(`could not resolve plugin package "${specifier}"`);
    return null;
  }
  log.info(`discovery: resolved "${specifier}" -> ${pkgJsonPath}`);
  return readManifest(pkgJsonPath, specifier, false);
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
  const name = typeof pkg.name === "string" ? pkg.name : path.basename(dir);
  const icon = parsePluginIcon(pkg.freestyle);
  return {
    name,
    slug: pluginSlug(name),
    specifier,
    dir,
    local,
    pages: parsePluginPages(pkg.freestyle),
    ...(typeof pkg.description === "string"
      ? { description: pkg.description }
      : {}),
    ...(typeof pkg.author === "string" ? { author: pkg.author } : {}),
    ...(icon ? { icon } : {}),
  };
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
