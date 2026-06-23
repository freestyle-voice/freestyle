import { z } from "zod/v3";

/**
 * A single plugin entry: either a bare package/module specifier, or a
 * `[specifier, options]` tuple carrying free-form configuration. Mirrors the
 * shape OpenCode and Vite accept.
 */
export const pluginEntrySchema = z.union([
  z.string().min(1),
  z.tuple([z.string().min(1), z.record(z.unknown())]),
]);

export type PluginEntry = z.infer<typeof pluginEntrySchema>;

/** The persisted `plugins` setting: a list of plugin entries. */
export const pluginsSettingSchema = z.array(pluginEntrySchema);

export type PluginsSetting = z.infer<typeof pluginsSettingSchema>;

/**
 * Coerce a persisted JSON string into a valid {@link PluginsSetting}, returning
 * an empty list when missing or malformed.
 */
export function parsePluginsSetting(
  value: string | null | undefined,
): PluginsSetting {
  if (!value) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return [];
  }
  const result = pluginsSettingSchema.safeParse(parsed);
  return result.success ? result.data : [];
}

/** Normalize an entry to its specifier + options. */
export function pluginEntryParts(entry: PluginEntry): {
  specifier: string;
  options?: Record<string, unknown>;
} {
  return typeof entry === "string"
    ? { specifier: entry }
    : { specifier: entry[0], options: entry[1] };
}
