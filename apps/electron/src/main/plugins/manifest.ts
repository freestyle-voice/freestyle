import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createAppLogger } from "@freestyle-voice/utils";
import {
  parsePluginsSetting,
  pluginEntryParts,
} from "@freestyle-voice/validations";
import {
  type PluginUIPage,
  parsePluginIcon,
  parsePluginPages,
  pluginSlug,
} from "freestyle-voice";

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
  /** Whether the plugin is currently enabled (not in `disabled_plugins`). */
  enabled: boolean;
  /**
   * True when the specifier is listed in the `plugins` setting but couldn't be
   * resolved on disk (e.g. a stale entry). Surfaced so the user can uninstall
   * it; it contributes no UI pages and its hooks don't load.
   */
  missing?: boolean;
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
    if (!discovered) {
      // A setting entry that resolves nowhere (e.g. a stale specifier). Surface
      // it so the user can uninstall it from the hub.
      out.push(missingPlugin(specifier, !disabled.has(specifier)));
      continue;
    }
    if (!seenDirs.has(discovered.dir)) {
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
 * Node resolution first, then the local plugins dir (where the installer
 * materializes downloaded packages, keyed by {@link pluginSlug}). Returns
 * `null` when the specifier resolves nowhere.
 */
function discoverPackage(
  specifier: string,
  localPluginsDir: string,
): DiscoveredPlugin | null {
  const pkgJsonPath = resolvePackageJson(specifier);
  if (pkgJsonPath) return readManifest(pkgJsonPath, specifier);

  const localPkgJson = path.join(
    localPluginsDir,
    pluginSlug(specifier),
    "package.json",
  );
  if (fs.existsSync(localPkgJson)) {
    return readManifest(localPkgJson, specifier);
  }

  return null;
}

/** A placeholder for a `plugins` setting entry that resolves nowhere. */
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
 * Resolve a package's `package.json` via Node resolution from several base
 * paths (a bundled Electron main has an unpredictable `import.meta.url`, and the
 * plugin may live in the app's `node_modules`). Returns `null` when unresolved;
 * the caller then checks the local plugins dir. There is intentionally no repo
 * `plugins/` workspace fallback: the UI must match the hook loader, which only
 * loads packages from `node_modules` or the local plugins dir.
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
    // Skip dotfiles, including the installer's transient `.<slug>-*` staging
    // dirs that exist mid-install.
    if (name.startsWith(".")) continue;
    const full = path.join(dir, name);
    const pkgJsonPath = path.join(full, "package.json");
    if (!fs.existsSync(pkgJsonPath)) continue;
    // Use the package's own name as the specifier so enable/disable (keyed by
    // specifier in `disabled_plugins`) matches, rather than the dir path.
    const pkgName = readPackageName(pkgJsonPath) ?? full;
    const discovered = readManifest(pkgJsonPath, pkgName);
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
  // A missing plugin has no directory (`dir: ""`); resolving against it would
  // fall back to `process.cwd()` and could leak files from the app root.
  if (!plugin?.dir) return null;

  const decoded = decodeURIComponent(assetPath).replace(/^\/+/, "");
  const resolved = path.resolve(plugin.dir, decoded);
  const root = path.resolve(plugin.dir);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    return null;
  }
  return resolved;
}
