export type AudioPlaybackMode = "off" | "duck" | "pause";
export type ActiveAudioPlaybackMode = Exclude<AudioPlaybackMode, "off">;

export function normalizeAudioPlaybackMode(
  value: string | null | undefined,
): AudioPlaybackMode {
  return value === "duck" || value === "pause" ? value : "off";
}

export function isActiveAudioPlaybackMode(
  value: unknown,
): value is ActiveAudioPlaybackMode {
  return value === "duck" || value === "pause";
}
