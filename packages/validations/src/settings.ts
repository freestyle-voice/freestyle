import { z } from "zod/v3";

export const settingValueSchema = z.object({
  value: z.string(),
});

export type SettingValueInput = z.infer<typeof settingValueSchema>;

/** Post-processing (AI cleanup) intensity levels. */
export const cleanupIntensitySchema = z.enum([
  "low",
  "medium",
  "high",
  "custom",
]);

export type CleanupIntensity = z.infer<typeof cleanupIntensitySchema>;

// Default cleanup strength for new users and missing settings.
export const DEFAULT_CLEANUP_INTENSITY: CleanupIntensity = "medium";

/**
 * Upper bound on a user-authored custom cleanup prompt. Comfortably above the
 * longest built-in preset (~8k chars) so users can seed Custom from any preset
 * and still have room to build on top of it.
 */
export const CLEANUP_CUSTOM_PROMPT_MAX = 20000;

export const cleanupCustomPromptSchema = z
  .string()
  .max(CLEANUP_CUSTOM_PROMPT_MAX);

/**
 * Coerce an arbitrary persisted value into a valid {@link CleanupIntensity},
 * falling back to the default when missing or malformed.
 */
export function parseCleanupIntensity(
  value: string | null | undefined,
): CleanupIntensity {
  const result = cleanupIntensitySchema.safeParse(value);
  return result.success ? result.data : DEFAULT_CLEANUP_INTENSITY;
}

/**
 * Enterprise network proxy URL. Empty string clears it. Must be an http(s)
 * (or socks) URL when set — this is what downloads are routed through on
 * managed corporate networks.
 */
export const proxyUrlSettingSchema = z
  .string()
  .max(2048)
  .refine(
    (value) => {
      if (value.trim() === "") return true;
      try {
        const url = new URL(value.trim());
        return ["http:", "https:", "socks:", "socks4:", "socks5:"].includes(
          url.protocol,
        );
      } catch {
        return false;
      }
    },
    {
      message:
        "Proxy must be a valid http://, https:// or socks:// URL (or empty to disable)",
    },
  );

/** Filesystem path to a custom CA certificate bundle. Empty string clears it. */
export const caCertPathSettingSchema = z.string().max(4096);

/**
 * Combined shape for the Network settings form. The renderer drives a
 * react-hook-form with this schema so its inline validation matches exactly
 * what the server enforces per-key on `PUT /settings/:key`.
 */
export const networkSettingsFormSchema = z.object({
  proxyUrl: proxyUrlSettingSchema,
  caCertPath: caCertPathSettingSchema,
});

export type NetworkSettingsForm = z.infer<typeof networkSettingsFormSchema>;

/** Date-range preset shown on the History page filter panel. */
export const historyPresetSchema = z.enum([
  "today",
  "weekly",
  "monthly",
  "all-time",
  "custom",
]);

export type HistoryPreset = z.infer<typeof historyPresetSchema>;

/**
 * Persisted History-page filter + view state, stored as a single JSON blob in
 * the renderer's `localStorage` (key `history.filters`) so a user's date range
 * and view toggles survive navigating away and back (and app restarts). It's a
 * UI-only preference, so it lives client-side rather than in the settings store.
 */
export const historyFiltersSettingSchema = z.object({
  preset: historyPresetSchema,
  customStartDate: z.string().max(32),
  customEndDate: z.string().max(32),
  filterOpen: z.boolean(),
  diffMode: z.boolean(),
  showAiEdits: z.boolean(),
  nerdMode: z.boolean(),
});

export type HistoryFiltersSetting = z.infer<typeof historyFiltersSettingSchema>;

/** Initial defaults for the History filter panel (matches the page's state). */
export const DEFAULT_HISTORY_FILTERS: HistoryFiltersSetting = {
  preset: "weekly",
  customStartDate: "",
  customEndDate: "",
  filterOpen: false,
  diffMode: false,
  showAiEdits: true,
  nerdMode: false,
};

/**
 * Coerce an arbitrary persisted value into a valid {@link HistoryFiltersSetting},
 * falling back to defaults for any missing or malformed fields.
 */
export function parseHistoryFilters(
  value: string | null | undefined,
): HistoryFiltersSetting {
  if (!value) return DEFAULT_HISTORY_FILTERS;
  try {
    const parsed = historyFiltersSettingSchema.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : DEFAULT_HISTORY_FILTERS;
  } catch {
    return DEFAULT_HISTORY_FILTERS;
  }
}
