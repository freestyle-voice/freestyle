/**
 * Single source of truth for the default push-to-talk hotkey.
 *
 * - macOS: Fn (Globe) — dedicated dictation key, no modifier conflicts
 * - Windows: Right Alt — a single dedicated key, no modifier chord needed
 * - Linux: Control+Alt+Space — no Super key, so the OS launcher /
 *   Start menu never fires alongside dictation, and the real key lets the
 *   native listeners suppress the chord from reaching the focused app
 *
 * Imported by both the main process and the preload script (which exposes it
 * to the renderer as `window.api.defaultHotkey`).
 */
export function getDefaultHotkey(platform: string = process.platform): string {
  switch (platform) {
    case "darwin":
      return "Fn";
    case "win32":
      return "RightAlt";
    default:
      return "Control+Alt+Space";
  }
}
