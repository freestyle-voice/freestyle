/**
 * Single source of truth for the commands hotkey default, mirroring
 * `hotkey-defaults.ts` for dictation.
 *
 * - macOS: Fn (Globe) + Control. Two modifiers and no letter, which is what
 *   keeps it clear of the Globe shortcuts macOS already owns — Globe+C is
 *   Control Center, Globe+E is emoji, Globe+F is fullscreen, and so on down
 *   the alphabet. It also shares its home key with dictation's solo Fn, so the
 *   two live under the same finger.
 * - Windows/Linux: Control+Alt+E, matching the dictation default's modifiers.
 *   A real key rather than a bare chord, because the native listeners on those
 *   platforms suppress a named key, not a modifier combination.
 *
 * Imported by the main process and the preload script (which exposes it to the
 * renderer as `window.api.defaultCommandHotkey`).
 */
export function getDefaultCommandHotkey(
  platform: string = process.platform,
): string {
  switch (platform) {
    case "darwin":
      return "Fn+Control";
    default:
      return "Control+Alt+E";
  }
}

/**
 * How long the key must be down to count as a hold, and so as speech. Below
 * this the press is a tap: the card opens on its own, showing the routes and
 * their digits, and nothing is recorded. The threshold matches the one
 * dictation uses to throw away an accidental tap, so the two hotkeys feel the
 * same under the finger.
 */
export const COMMAND_HOLD_THRESHOLD_MS = 250;

/**
 * How long a tapped-open card waits, untouched, before dismissing itself.
 *
 * Not merely tidiness: the route digits are held as global shortcuts for as
 * long as the card is up, so this is the bound on how long they can be taken
 * from the rest of the system. A card left open behind a full-screen window
 * would otherwise keep them indefinitely.
 */
export const COMMAND_IDLE_MS = 12_000;
