/**
 * Single source of truth for the default push-to-talk hotkey.
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

/**
 * Default push-to-talk hotkey for the Claude Code agent, distinct from the
 * dictation hotkey above (Voice OS, Phase 0).
 *
 * - macOS: Right Command — a dedicated hold key that doesn't collide with the
 *   Fn dictation key; observed by the native listener's right-modifier path.
 * - Windows/Linux: Control+Shift+Space — a hold-friendly combo unlikely to
 *   clash with the dictation defaults or common shortcuts.
 */
export function getDefaultAgentHotkey(
  platform: string = process.platform,
): string {
  switch (platform) {
    case "darwin":
      return "RightCommand";
    default:
      return "Control+Shift+Space";
  }
}
