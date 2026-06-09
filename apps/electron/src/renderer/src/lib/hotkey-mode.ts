export type HotkeyActivationMode = "hold" | "toggle";

export function parseHotkeyMode(value: unknown): HotkeyActivationMode {
  return value === "toggle" ? "toggle" : "hold";
}

export function hotkeyModeDescription(mode: HotkeyActivationMode): string {
  return mode === "toggle"
    ? "Press your shortcut once to start, press again to stop — hands-free for long dictations."
    : "Hold your shortcut while you speak, release to transcribe.";
}

export function hotkeyModeHotkeyHint(mode: HotkeyActivationMode): string {
  return mode === "toggle"
    ? "Press the shortcut once to start, press again to stop."
    : "Hold the shortcut to record, release to transcribe.";
}

export function showsLivePartialPreview(mode: HotkeyActivationMode): boolean {
  return mode === "toggle";
}
