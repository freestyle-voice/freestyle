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

export const HISTORY_RETENTION_DAYS_MAX = 3650;

export function parseRetentionDays(
  value: string | null | undefined,
): number | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const days = Number(trimmed);
  if (days < 1 || days > HISTORY_RETENTION_DAYS_MAX) return null;
  return days;
}

export const historyRetentionDaysSettingSchema = z
  .string()
  .refine(
    (value) => value.trim() === "" || parseRetentionDays(value) !== null,
    {
      message: `Retention must be a whole number of days between 1 and ${HISTORY_RETENTION_DAYS_MAX} (or empty to disable)`,
    },
  );

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

// ---------------------------------------------------------------------------
// Per-tab settings form schemas
//
// The Settings page splits into one react-hook-form per tab. Each form persists
// on change (no submit button) — every field write goes straight to
// `PUT /settings/:key` or a `window.api.*` IPC call. These schemas give each
// form the same validation the server enforces, and centralize the string
// unions that used to live inline in the renderer.
// ---------------------------------------------------------------------------

/** Push-to-talk activation: hold the hotkey vs. toggle on/off. */
export const hotkeyModeSchema = z.enum(["hold", "toggle"]);
export type HotkeyMode = z.infer<typeof hotkeyModeSchema>;

/** How a finished transcript is delivered. */
export const outputModeSchema = z.enum(["paste", "clipboard"]);
export type OutputMode = z.infer<typeof outputModeSchema>;

/** Color theme (mirrors next-themes values). */
export const themeSchema = z.enum(["light", "dark", "system"]);
export type ThemeSetting = z.infer<typeof themeSchema>;

/** Background-audio behavior while recording. */
export const audioPlaybackModeSchema = z.enum(["off", "duck", "pause"]);
export type AudioPlaybackModeSetting = z.infer<typeof audioPlaybackModeSchema>;

/** Auto-delete retention preset shown on the Data tab. */
export const historyRetentionPresetSchema = z.enum([
  "never",
  "7",
  "30",
  "custom",
]);
export type HistoryRetentionPreset = z.infer<
  typeof historyRetentionPresetSchema
>;

/** Recording tab form. `micDeviceId` empty string = system default mic. */
export const recordingSettingsFormSchema = z.object({
  micDeviceId: z.string(),
  hotkey: z.string(),
  hotkeyMode: hotkeyModeSchema,
  language: z.string(),
  outputMode: outputModeSchema,
  soundEnabled: z.boolean(),
  audioPlaybackMode: audioPlaybackModeSchema,
});
export type RecordingSettingsForm = z.infer<typeof recordingSettingsFormSchema>;

/** Application tab form (all IPC-backed toggles). */
export const applicationSettingsFormSchema = z.object({
  autoUpdate: z.boolean(),
  launchAtStartup: z.boolean(),
  showOnLaunch: z.boolean(),
});
export type ApplicationSettingsForm = z.infer<
  typeof applicationSettingsFormSchema
>;

/** Display tab form. `pillPosition` is a free string ("custom" + coords). */
export const displaySettingsFormSchema = z.object({
  theme: themeSchema,
  pillPosition: z.string(),
});
export type DisplaySettingsForm = z.infer<typeof displaySettingsFormSchema>;

/**
 * Data tab form. When the preset is "custom", `customRetentionDays` must be a
 * valid day count; for every other preset the field is ignored.
 */
export const dataSettingsFormSchema = z
  .object({
    historyPaused: z.boolean(),
    historyRetention: historyRetentionPresetSchema,
    customRetentionDays: z.string(),
  })
  .refine(
    (data) =>
      data.historyRetention !== "custom" ||
      parseRetentionDays(data.customRetentionDays) !== null,
    {
      message: `Retention must be a whole number of days between 1 and ${HISTORY_RETENTION_DAYS_MAX}`,
      path: ["customRetentionDays"],
    },
  );
export type DataSettingsForm = z.infer<typeof dataSettingsFormSchema>;

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
