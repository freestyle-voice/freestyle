/**
 * UI contribution descriptors. A plugin may declare one or more pages in its
 * `package.json` under `freestyle.contributes.pages`; the host renders each in a
 * sandboxed web view and lists it in the Plugins hub.
 */

/** A single page a plugin contributes to the app's UI. */
export interface PluginUIPage {
  /** Stable, plugin-unique id (used in the page route). */
  id: string;
  /** Display title, shown in the hub and as the page heading. */
  title: string;
  /** Optional lucide-react icon name. */
  icon?: string;
  /**
   * Path to the page's HTML entry, relative to the plugin package root
   * (e.g. `"ui/dist/index.html"`).
   */
  entry: string;
}

/** The `freestyle.contributes` block of a plugin's `package.json`. */
export interface PluginContributes {
  pages?: PluginUIPage[];
}

/** The `freestyle` block of a plugin's `package.json`. */
export interface PluginManifest {
  /**
   * Icon shown for the plugin in the Plugins hub. Must be the name of an icon
   * from the app's icon set (lucide), in PascalCase (e.g. `"FileMusic"`) or
   * kebab-case (e.g. `"file-music"`). Falls back to a default when omitted or
   * unknown.
   */
  icon?: string;
  contributes?: PluginContributes;
}

/**
 * Derive a URL- and route-safe slug from a package name, e.g.
 * `@freestyle/plugin-audio-transcription` → `freestyle-plugin-audio-transcription`.
 * Used as the `freestyle-plugin://` host and the `/plugins/:slug/...` route
 * segment, since package names can contain `@` and `/` which are unsafe in both.
 */
export function pluginSlug(name: string): string {
  return name
    .replace(/^@/, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Parse and validate the `freestyle` field of a plugin's `package.json` into a
 * normalized list of {@link PluginUIPage}. Tolerant of missing/malformed input:
 * unknown shapes and invalid page entries are dropped rather than throwing, so a
 * bad manifest can never crash plugin discovery.
 */
export function parsePluginPages(freestyleField: unknown): PluginUIPage[] {
  if (!isRecord(freestyleField)) return [];
  const contributes = freestyleField.contributes;
  if (!isRecord(contributes)) return [];
  const pages = contributes.pages;
  if (!Array.isArray(pages)) return [];

  const result: PluginUIPage[] = [];
  const seen = new Set<string>();
  for (const page of pages) {
    if (!isRecord(page)) continue;
    const { id, title, entry, icon } = page;
    if (typeof id !== "string" || !id) continue;
    if (typeof title !== "string" || !title) continue;
    if (typeof entry !== "string" || !entry) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    result.push({
      id,
      title,
      entry,
      ...(typeof icon === "string" && icon ? { icon } : {}),
    });
  }
  return result;
}

/**
 * Read the plugin-level `freestyle.icon` from a `package.json`'s `freestyle`
 * field. Returns `undefined` when absent or not a non-empty string.
 */
export function parsePluginIcon(freestyleField: unknown): string | undefined {
  if (!isRecord(freestyleField)) return undefined;
  const { icon } = freestyleField;
  return typeof icon === "string" && icon ? icon : undefined;
}
