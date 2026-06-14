/**
 * Single source of truth for the default push to hold hotkey.
 *
 * - macOS: Fn (Globe) — dedicated dictation key, no modifier conflicts
 * - Windows: Control+Super — avoids Alt+Space window menu and common shortcuts
 * - Linux: Alt+Super — common dictation combo (e.g. pepper-x), avoids WM launcher binds
 *
 * Imported by both the main process and the preload script (which exposes it
 * to the renderer as `window.api.defaultHotkey`).
 */
export function getDefaultHotkey(platform: string = process.platform): string {
  switch (platform) {
    case "darwin":
      return "Fn";
    case "win32":
      return "Control+Super";
    case "linux":
      return "Alt+Super";
    default:
      return "Control+Super";
  }
}
