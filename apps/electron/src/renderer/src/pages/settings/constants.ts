import { Monitor, Moon, Pause, Sun, Volume2, VolumeOff } from "lucide-react";

// ---------------------------------------------------------------------------
// Static option lists (labels are resolved via i18n at render time)
// ---------------------------------------------------------------------------

export const themeOptions = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

export const audioPlaybackOptions = [
  { id: "off", label: "Off", icon: VolumeOff },
  { id: "duck", label: "Duck", icon: Volume2 },
  { id: "pause", label: "Pause", icon: Pause },
] as const;

// ---------------------------------------------------------------------------
// Section navigation (hash-synced tabs)
// ---------------------------------------------------------------------------

export const settingsSectionIds = [
  "recording",
  "application",
  "display",
  "permissions",
  "data",
  "network",
] as const;

export type SettingsSectionId = (typeof settingsSectionIds)[number];

export function parseSettingsSection(hash: string): SettingsSectionId {
  const id = hash.replace(/^#/, "");
  return (settingsSectionIds as readonly string[]).includes(id)
    ? (id as SettingsSectionId)
    : "recording";
}

// ---------------------------------------------------------------------------
// Microphone select boundary
// ---------------------------------------------------------------------------

/**
 * Radix SelectItem cannot use an empty-string value, so the "system default"
 * microphone (stored as "") is represented by this sentinel at the Select
 * boundary only. Use an unlikely string to avoid colliding with a real
 * deviceId of "default".
 */
export const SYSTEM_DEFAULT_MIC = "__system_default_mic__";

export interface AudioDevice {
  deviceId: string;
  label: string;
}

export function normalizePillPos(pos: string): string {
  return pos.startsWith("custom") ? "custom" : pos;
}
