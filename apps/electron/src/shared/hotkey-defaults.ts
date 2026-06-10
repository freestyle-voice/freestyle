/**
 * Single source of truth for the default push-to-talk hotkey.
 *
 * Alt+Space opens the window system menu on Windows and the window menu on
 * many Linux window managers, so it is only a safe default on macOS.
 *
 * Imported by both the main process and the preload script (which exposes it
 * to the renderer as `window.api.defaultHotkey`).
 */
export function getDefaultHotkey(platform: string = process.platform): string {
  return platform === "darwin" ? "Alt+Space" : "Control+Alt+Space";
}
