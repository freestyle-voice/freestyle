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

/**
 * A single declarative settings field a plugin contributes. The host renders
 * these in the plugin's detail page and persists values to this plugin's
 * namespaced settings (`ctx.settings.getOwn(key)`), so a plugin gets
 * configuration without building a full UI page.
 */
export type PluginSettingField =
  | {
      key: string;
      type: "string" | "number";
      label: string;
      description?: string;
      default?: string;
    }
  | {
      key: string;
      type: "boolean";
      label: string;
      description?: string;
      default?: boolean;
    }
  | {
      key: string;
      type: "select";
      label: string;
      description?: string;
      options: { value: string; label: string }[];
      default?: string;
    };

/** The `freestyle.contributes` block of a plugin's `package.json`. */
export interface PluginContributes {
  pages?: PluginUIPage[];
  settings?: PluginSettingField[];
}

/** The `freestyle` block of a plugin's `package.json`. */
export interface PluginManifest {
  /**
   * Human-readable name shown in the Plugins hub. When omitted, the app
   * derives a display name from the package name (stripping scope and
   * `freestyle-plugin-` prefix, then Title Casing).
   */
  displayName?: string;
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
 * A short, deterministic hash of a string (FNV-1a, base36). Pure and
 * dependency-free so it runs identically in the browser (plugin UI) and Node
 * (host). Not cryptographic — only used to disambiguate slugs.
 */
function shortHash(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // >>> 0 to interpret as unsigned before base36; pad for a stable width.
  return (h >>> 0).toString(36).padStart(7, "0");
}

/**
 * Derive a URL- and route-safe slug from a package name, e.g.
 * `@freestyle-voice/plugin-audio-transcription` →
 * `freestyle-voice-plugin-audio-transcription-<hash>`.
 * Used as the `/plugins/:slug/...` route segment, the on-disk package dir, and
 * the per-plugin session partition, since package names can contain `@` and `/`
 * which are unsafe in those contexts.
 *
 * The sanitization (lower-casing, collapsing non-alphanumerics) is lossy, so
 * distinct names like `@a/b`, `a-b`, and `A.B` would otherwise collide to the
 * same slug — and, as a partition/storage identity, let one plugin read
 * another's data. A short hash of the *original* name is appended to guarantee
 * distinct packages always get distinct slugs.
 */
export function pluginSlug(name: string): string {
  const base = name
    .replace(/^@/, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return `${base}-${shortHash(name)}`;
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

type SettingFieldType = PluginSettingField["type"];

function isSettingFieldType(value: string): value is SettingFieldType {
  return (
    value === "string" ||
    value === "number" ||
    value === "boolean" ||
    value === "select"
  );
}

/**
 * Parse and validate the `freestyle` field's `contributes.settings` into a
 * normalized list of {@link PluginSettingField}. Tolerant of missing/malformed
 * input, mirroring {@link parsePluginPages}: unknown shapes, invalid fields,
 * and duplicate keys are dropped rather than throwing.
 */
export function parsePluginSettingsFields(
  freestyleField: unknown,
): PluginSettingField[] {
  if (!isRecord(freestyleField)) return [];
  const contributes = freestyleField.contributes;
  if (!isRecord(contributes)) return [];
  const fields = contributes.settings;
  if (!Array.isArray(fields)) return [];

  const result: PluginSettingField[] = [];
  const seen = new Set<string>();
  for (const field of fields) {
    if (!isRecord(field)) continue;
    const { key, type, label } = field;
    if (typeof key !== "string" || !key) continue;
    if (typeof type !== "string" || !isSettingFieldType(type)) continue;
    if (typeof label !== "string" || !label) continue;
    if (seen.has(key)) continue;

    const description =
      typeof field.description === "string" && field.description
        ? field.description
        : undefined;

    if (type === "select") {
      const options = field.options;
      if (!Array.isArray(options)) continue;
      const parsedOptions = options
        .filter(isRecord)
        .filter(
          (o): o is { value: string; label: string } =>
            typeof o.value === "string" && typeof o.label === "string",
        )
        .map((o) => ({ value: o.value, label: o.label }));
      if (parsedOptions.length === 0) continue;
      seen.add(key);
      result.push({
        key,
        type,
        label,
        options: parsedOptions,
        ...(description ? { description } : {}),
        ...(typeof field.default === "string"
          ? { default: field.default }
          : {}),
      });
      continue;
    }

    if (type === "boolean") {
      seen.add(key);
      result.push({
        key,
        type,
        label,
        ...(description ? { description } : {}),
        ...(typeof field.default === "boolean"
          ? { default: field.default }
          : {}),
      });
      continue;
    }

    // "string" | "number"
    seen.add(key);
    result.push({
      key,
      type,
      label,
      ...(description ? { description } : {}),
      ...(typeof field.default === "string" ? { default: field.default } : {}),
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

/**
 * Read the plugin-level `freestyle.displayName` from a `package.json`'s
 * `freestyle` field. Returns `undefined` when absent or not a non-empty string.
 */
export function parsePluginDisplayName(
  freestyleField: unknown,
): string | undefined {
  if (!isRecord(freestyleField)) return undefined;
  const { displayName } = freestyleField;
  return typeof displayName === "string" && displayName.trim()
    ? displayName.trim()
    : undefined;
}
