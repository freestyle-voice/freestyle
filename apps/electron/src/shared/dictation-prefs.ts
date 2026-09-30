export interface DictationPrefs {
  destination: "cursor" | "composer";
  outputMode: "paste" | "clipboard";
  soundEnabled: boolean;
  audioPlaybackMode: "off" | "duck" | "pause";
  micDeviceId: string | null;
}

export const DICTATION_DESTINATIONS = ["cursor", "composer"] as const;
export type DictationDestinationSetting =
  (typeof DICTATION_DESTINATIONS)[number];
export const DEFAULT_DICTATION_DESTINATION: DictationDestinationSetting =
  "cursor";

export function parseDictationDestination(
  value: string | null | undefined,
): DictationDestinationSetting {
  return DICTATION_DESTINATIONS.includes(value as DictationDestinationSetting)
    ? (value as DictationDestinationSetting)
    : DEFAULT_DICTATION_DESTINATION;
}
