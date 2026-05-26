/**
 * Cross-platform global hotkey using uiohook-napi.
 *
 * Uses a passive (listen-only) event tap — keystrokes are never blocked.
 * Supports hold-to-release on all platforms (macOS, Windows, Linux).
 */

import type { UiohookKeyboardEvent } from "uiohook-napi";
import { UiohookKey, uIOhook } from "uiohook-napi";

const DEFAULT_HOTKEY = "Alt+Space";

/** Parsed hotkey: a set of required modifier flags + a trigger keycode. */
interface HotkeyConfig {
  alt: boolean;
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
  keycode: number;
}

/** Map accelerator key names (lowercase) to uiohook keycodes. */
const KEY_MAP: Record<string, number> = {
  space: UiohookKey.Space,
  enter: UiohookKey.Enter,
  return: UiohookKey.Enter,
  escape: UiohookKey.Escape,
  tab: UiohookKey.Tab,
  backspace: UiohookKey.Backspace,
  delete: UiohookKey.Delete,
  up: UiohookKey.ArrowUp,
  down: UiohookKey.ArrowDown,
  left: UiohookKey.ArrowLeft,
  right: UiohookKey.ArrowRight,
  // Fn/Globe key on macOS — not in UiohookKey, raw scan code 0x0E36
  fn: 0x0e36,
};

// Build the map from UiohookKey at runtime — iterate all entries to
// avoid issues with numeric property keys ("0".."9") and ensure every
// key the library knows about is mapped.
const ukObj = UiohookKey as Record<string, number>;
for (const [name, code] of Object.entries(ukObj)) {
  if (typeof code !== "number") continue;
  const lower = name.toLowerCase();
  if (!(lower in KEY_MAP)) {
    KEY_MAP[lower] = code;
  }
}

/** Parse an Electron-style accelerator (e.g. "Alt+Space") into a HotkeyConfig. */
function parseAccelerator(accel: string): HotkeyConfig {
  const parts = accel.split("+").map((p) => p.trim().toLowerCase());
  const keyPart = parts[parts.length - 1];
  const mods = new Set(parts.slice(0, -1));

  // Handle stale "KeyNN" format from previous recording sessions where
  // the raw keycode was stored (e.g. "Key11" = keycode 11 = digit 0).
  const keyMatch = keyPart.match(/^key(\d+)$/);
  if (keyMatch) {
    const rawCode = Number.parseInt(keyMatch[1], 10);
    return {
      alt: mods.has("alt") || mods.has("option"),
      ctrl:
        mods.has("ctrl") ||
        mods.has("control") ||
        mods.has("commandorcontrol") ||
        mods.has("cmdorctrl"),
      meta:
        mods.has("meta") ||
        mods.has("super") ||
        mods.has("command") ||
        mods.has("commandorcontrol") ||
        mods.has("cmdorctrl"),
      shift: mods.has("shift"),
      keycode: rawCode,
    };
  }

  return {
    alt: mods.has("alt") || mods.has("option"),
    ctrl:
      mods.has("ctrl") ||
      mods.has("control") ||
      mods.has("commandorcontrol") ||
      mods.has("cmdorctrl"),
    meta:
      mods.has("meta") ||
      mods.has("super") ||
      mods.has("command") ||
      mods.has("commandorcontrol") ||
      mods.has("cmdorctrl"),
    shift: mods.has("shift"),
    keycode: KEY_MAP[keyPart] ?? 0,
  };
}

function isValidAccelerator(accel: string): boolean {
  if (!accel || typeof accel !== "string") return false;
  if (!/^[\x20-\x7E]+$/.test(accel)) return false;
  if (accel.endsWith("+")) return false;
  const parts = accel.split("+");
  return parts.every((p) => p.trim().length > 0);
}

function matchesHotkey(e: UiohookKeyboardEvent, cfg: HotkeyConfig): boolean {
  if (e.keycode !== cfg.keycode) return false;
  if (cfg.alt !== e.altKey) return false;
  if (cfg.ctrl !== e.ctrlKey) return false;
  if (cfg.meta !== e.metaKey) return false;
  if (cfg.shift !== e.shiftKey) return false;
  return true;
}

export interface HotkeyCallbacks {
  onDown: () => void;
  onUp: () => void;
  onError: (message: string) => void;
}

let started = false;
let config: HotkeyConfig | null = null;
let pressed = false;
let callbacks: HotkeyCallbacks | null = null;
let recordingMode = false;
let recordingCallback: ((event: UiohookKeyboardEvent) => void) | null = null;

/** Start the global hook (call once at app startup). */
export function startHook(): void {
  if (started) return;

  uIOhook.on("keydown", (e: UiohookKeyboardEvent) => {
    if (recordingMode && recordingCallback) {
      recordingCallback(e);
      return;
    }
    if (!config || !callbacks) return;
    if (pressed) return; // ignore key repeat
    if (!matchesHotkey(e, config)) return;
    pressed = true;
    callbacks.onDown();
  });

  uIOhook.on("keyup", (e: UiohookKeyboardEvent) => {
    if (recordingMode) return;
    if (!config || !callbacks) return;
    if (!pressed) return;
    // Only check keycode for up — modifiers may already be released
    if (e.keycode !== config.keycode) return;
    pressed = false;
    callbacks.onUp();
  });

  try {
    uIOhook.start();
    started = true;
  } catch (err) {
    console.error("[hotkey] Failed to start uiohook:", err);
    callbacks?.onError(
      "Could not start the global key listener. " +
        "Please check that Accessibility permissions are granted in " +
        "System Settings > Privacy & Security > Accessibility.",
    );
  }
}

/** Register a hotkey accelerator and callbacks. */
export function registerHotkey(
  accel: string | undefined,
  cbs: HotkeyCallbacks,
): void {
  callbacks = cbs;
  pressed = false;
  const resolved = accel && isValidAccelerator(accel) ? accel : DEFAULT_HOTKEY;
  config = parseAccelerator(resolved);
  if (config.keycode === 0) {
    console.warn(`[hotkey] Unknown key in accelerator "${resolved}"`);
    config = parseAccelerator(DEFAULT_HOTKEY);
  }
}

/** Enter recording mode — all keydown events go to `cb`. */
export function startRecording(
  cb: (event: UiohookKeyboardEvent) => void,
): void {
  recordingMode = true;
  recordingCallback = cb;
  pressed = false;
}

/** Exit recording mode. */
export function stopRecording(): void {
  recordingMode = false;
  recordingCallback = null;
}

/** Stop the global hook (call on app quit). */
export function stopHook(): void {
  if (!started) return;
  try {
    uIOhook.stop();
  } catch {}
  started = false;
}

export { DEFAULT_HOTKEY, isValidAccelerator };
