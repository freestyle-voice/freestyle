import { IS_MAC } from "@renderer/lib/platform";
import { useCallback, useEffect, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// Platform detection
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Key symbol maps
// ---------------------------------------------------------------------------

const MAC_MOD_SYMBOLS: Record<string, string> = {
  Control: "\u2303",
  Command: "\u2318",
  Alt: "\u2325",
  Shift: "\u21E7",
  Fn: "\uD83C\uDF10",
};

const OTHER_MOD_LABELS: Record<string, string> = {
  Control: "Ctrl",
  Command: "Super",
  Alt: "Alt",
  Shift: "Shift",
  Super: "Super",
  Fn: "Fn",
};

const KEY_SYMBOLS: Record<string, string> = {
  Space: "\u2423",
  Return: "\u21A9",
  Backspace: "\u232B",
  Delete: "\u2326",
  Escape: "\u238B",
  Tab: "\u21E5",
  Up: "\u2191",
  Down: "\u2193",
  Left: "\u2190",
  Right: "\u2192",
  Fn: "\uD83C\uDF10",
  MouseButton4: "Mouse 4",
  MouseButton5: "Mouse 5",
  RightAlt: "Right Alt",
  RightOption: "Right Alt",
  RightControl: "Right Ctrl",
  RightShift: "Right Shift",
  RightSuper: "Right Super",
  RightCommand: "Right Super",
};

/** Side-specific right-modifier symbols shown on macOS (falls back to KEY_SYMBOLS elsewhere). */
const MAC_RIGHT_MOD_SYMBOLS: Record<string, string> = {
  RightControl: "Right \u2303",
  RightCommand: "Right \u2318",
  RightAlt: "Right \u2325",
  RightOption: "Right \u2325",
  RightShift: "Right \u21E7",
};

/** Maps a side-specific modifier token to the generic token it collapses to for display/merging. */
const RIGHT_MODIFIER_TO_GENERIC: Record<string, string> = {
  RightAlt: "Alt",
  RightOption: "Alt",
  RightCommand: "Command",
  RightControl: "Control",
  RightShift: "Shift",
  RightSuper: "Super",
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HotkeyCombo {
  modifiers: string[];
  key: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MODIFIER_ORDER = ["Control", "Command", "Alt", "Shift", "Super", "Fn"];
const MODIFIER_ALIASES: Record<string, string> = {
  CommandOrControl: IS_MAC ? "Command" : "Control",
  CmdOrCtrl: IS_MAC ? "Command" : "Control",
};
const MODIFIER_KEYS = new Set([
  ...MODIFIER_ORDER,
  "RightAlt",
  "RightOption",
  "RightControl",
  "RightShift",
  "RightCommand",
  "RightSuper",
]);
const MACRO_MOUSE_BUTTONS = new Set(["MouseButton4", "MouseButton5"]);
const CAPTURED_MODIFIER_KEYS: Record<string, string> = {
  Fn: "Fn",
  RightAlt: "Alt",
  RightOption: "Alt",
  RightControl: "Control",
  RightShift: "Shift",
  RightCommand: "Command",
  RightSuper: "Super",
};

/** Fallback capture inside Settings when native global recording is unavailable. */
const USE_DOM_CAPTURE = true;

const DOM_MODIFIER_KEYS = new Set([
  "Control",
  "Meta",
  "Alt",
  "Shift",
  "Command",
  "Option",
]);

function modifiersFromEvent(e: KeyboardEvent): string[] {
  const mods: string[] = [];
  if (e.ctrlKey) mods.push("Control");
  if (e.metaKey) mods.push(IS_MAC ? "Command" : "Control");
  if (e.altKey) mods.push("Alt");
  if (e.shiftKey) mods.push("Shift");
  return MODIFIER_ORDER.filter((m) => mods.includes(m));
}

function domKeyFromEvent(e: KeyboardEvent): string | null {
  const code = e.code;
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code === "Space") return "Space";
  if (code === "Backspace") return "Backspace";
  if (code === "Delete") return "Delete";
  if (code === "Escape") return "Escape";
  if (code === "Tab") return "Tab";
  if (code === "Enter") return "Return";
  if (code.startsWith("Arrow")) return code.slice(5);
  if (code.startsWith("F") && /^F\d+$/.test(code)) return code;
  if (e.key.length === 1 && e.key !== " ") return e.key.toUpperCase();
  if (e.key === " ") return "Space";
  return e.key.length === 1 ? e.key : null;
}

function isDomModifierKey(e: KeyboardEvent): boolean {
  return DOM_MODIFIER_KEYS.has(e.key) || e.key === "Option";
}

function orderModifiers(modifiers: string[]): string[] {
  const unique = new Set(modifiers);
  return MODIFIER_ORDER.filter((modifier) => unique.has(modifier));
}

function mergeModifiers(current: string[], incoming: string[]): string[] {
  return orderModifiers([...current, ...incoming]);
}

function normalizeCapturedCombo(
  current: HotkeyCombo,
  captured: HotkeyCombo,
): HotkeyCombo {
  const capturedModifier = captured.key
    ? CAPTURED_MODIFIER_KEYS[captured.key]
    : null;

  return {
    modifiers: mergeModifiers(
      current.modifiers,
      capturedModifier
        ? [...captured.modifiers, capturedModifier]
        : captured.modifiers,
    ),
    key: capturedModifier ? current.key : captured.key,
  };
}

function isModifierName(part: string): boolean {
  return MODIFIER_ORDER.includes(part) || part in MODIFIER_ALIASES;
}

function modifierName(part: string): string | null {
  if (MODIFIER_ORDER.includes(part)) return part;
  return MODIFIER_ALIASES[part] ?? null;
}

export function comboToAccelerator(combo: HotkeyCombo): string | null {
  if (!isValidHotkeyCombo(combo)) return null;
  return combo.key
    ? [...combo.modifiers, combo.key].join("+")
    : combo.modifiers.join("+");
}

export function isValidHotkeyCombo(combo: HotkeyCombo | null): boolean {
  if (!combo) return false;
  if (combo.modifiers.length > 0) return true;
  return (
    !!combo.key &&
    (MODIFIER_KEYS.has(combo.key) || MACRO_MOUSE_BUTTONS.has(combo.key))
  );
}

export function needsModifierOrMouseButton(combo: HotkeyCombo | null): boolean {
  return !!combo && !isValidHotkeyCombo(combo);
}

export function acceleratorToCombo(accel: string): HotkeyCombo {
  const parts = accel.split("+").map((p) => p.trim());
  const key = parts.every(isModifierName) ? null : parts[parts.length - 1];
  const modifiers: string[] = [];
  const modifierParts = key ? parts.slice(0, -1) : parts;

  for (const p of modifierParts) {
    const modifier = modifierName(p);
    if (modifier) modifiers.push(modifier);
  }

  return {
    modifiers: MODIFIER_ORDER.filter((m) => modifiers.includes(m)),
    key,
  };
}

export function keyDisplayLabel(key: string): string {
  if (IS_MAC && MAC_MOD_SYMBOLS[key]) return MAC_MOD_SYMBOLS[key];
  if (IS_MAC && MAC_RIGHT_MOD_SYMBOLS[key]) return MAC_RIGHT_MOD_SYMBOLS[key];
  if (!IS_MAC && OTHER_MOD_LABELS[key]) return OTHER_MOD_LABELS[key];
  if (KEY_SYMBOLS[key]) return KEY_SYMBOLS[key];
  return key;
}

// ---------------------------------------------------------------------------
// Right-modifier latch — tracks whether the in-progress draft combo is a
// solo right-side modifier press, so it can be saved as the side-specific
// accelerator (e.g. "RightCommand") instead of the generic one ("Command").
// ---------------------------------------------------------------------------

/** Normalized description of a single modifiers-update event, from either the
 *  native listener or the DOM keydown handler. */
export interface RightModifierUpdateEvent {
  /** The side-specific token this update represents a lone press of, or null. */
  rightToken: string | null;
  /** Total modifier count carried by this update. */
  modifierCount: number;
  /** This update's modifiers after mapping side-specific tokens to generic. */
  genericModifiers: string[];
  /** True only when the update definitively identifies a left-side key (e.g. DOM `MetaLeft`). */
  explicitLeft?: boolean;
}

/** Maps DOM `KeyboardEvent.code` to the side-specific token it represents (macOS only). */
function domRightModifierToken(e: KeyboardEvent): string | null {
  if (!IS_MAC) return null;
  switch (e.code) {
    case "MetaRight":
      return "RightCommand";
    case "AltRight":
      return "RightOption";
    case "ControlRight":
      return "RightControl";
    case "ShiftRight":
      return "RightShift";
    default:
      return null;
  }
}

/**
 * Decides the next right-modifier latch value given the previous latch, the
 * draft combo before this update was applied, and a normalized description
 * of the update. Idempotent for duplicate delivery of the same right
 * modifier (native + DOM both fire when the settings window is focused).
 */
export function nextRightModifierLatch(
  previousLatch: string | null,
  draftBeforeUpdate: HotkeyCombo,
  event: RightModifierUpdateEvent,
): string | null {
  const draftEmpty =
    draftBeforeUpdate.modifiers.length === 0 && draftBeforeUpdate.key === null;

  if (event.rightToken && event.modifierCount === 1) {
    if (draftEmpty || event.rightToken === previousLatch) {
      return event.rightToken;
    }
  }

  if (event.rightToken && event.rightToken === previousLatch) {
    return previousLatch;
  }

  // A same-callback trailing generic update (e.g. the Swift binary's
  // RIGHT_MOD_DOWN:RightCommand is unconditionally followed by FLAGS:command
  // from the same flagsChanged invocation) or a duplicate generic delivery
  // consistent with the latched key keeps the latch. Only a definitively
  // left-side DOM event, a chord, or an inconsistent modifier clears it.
  if (
    previousLatch &&
    !event.explicitLeft &&
    event.modifierCount === 1 &&
    event.genericModifiers[0] === RIGHT_MODIFIER_TO_GENERIC[previousLatch]
  ) {
    return previousLatch;
  }

  return null;
}

export function comboDisplayKeys(combo: HotkeyCombo): string[] {
  const keys = combo.modifiers.map(keyDisplayLabel);
  if (combo.key) keys.push(keyDisplayLabel(combo.key));
  return keys;
}

export function formatAcceleratorKeys(accel: string): string[] {
  return comboDisplayKeys(acceleratorToCombo(accel));
}

export function formatAccelerator(accel: string): string {
  return formatAcceleratorKeys(accel).join(" ");
}

// ---------------------------------------------------------------------------
// Hook -- uses main process IPC for recording (captures fn/globe key)
// ---------------------------------------------------------------------------

type RecorderState = "idle" | "recording";
const EMPTY_COMBO: HotkeyCombo = { modifiers: [], key: null };

interface UseHotkeyRecorderReturn {
  state: RecorderState;
  liveModifiers: string[];
  capturedCombo: HotkeyCombo | null;
  canSaveRecording: boolean;
  needsModifierOrMouseButton: boolean;
  invalidReleaseNotice: boolean;
  startRecording: () => void;
  cancelRecording: () => void;
}

export function useHotkeyRecorder(
  onRecord: (accelerator: string) => void,
): UseHotkeyRecorderReturn {
  const [state, setState] = useState<RecorderState>("idle");
  const [draftCombo, setDraftCombo] = useState<HotkeyCombo>(EMPTY_COMBO);
  const [invalidReleaseNotice, setInvalidReleaseNotice] = useState(false);
  const onRecordRef = useRef(onRecord);
  onRecordRef.current = onRecord;
  const recordingActiveRef = useRef(false);
  const draftComboRef = useRef<HotkeyCombo>(EMPTY_COMBO);
  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Solo right-modifier latch: set when the draft is exactly one modifier
  // produced solely by a right-side key press. See nextRightModifierLatch.
  const rightModifierLatchRef = useRef<string | null>(null);

  const updateDraftCombo = useCallback(
    (updater: (combo: HotkeyCombo) => HotkeyCombo) => {
      const next = updater(draftComboRef.current);
      draftComboRef.current = next;
      setDraftCombo(next);
    },
    [],
  );

  const clearWarningTimer = useCallback(() => {
    if (warningTimerRef.current) {
      clearTimeout(warningTimerRef.current);
      warningTimerRef.current = null;
    }
  }, []);

  const showInvalidReleaseNotice = useCallback(() => {
    clearWarningTimer();
    setInvalidReleaseNotice(true);
    warningTimerRef.current = setTimeout(() => {
      setInvalidReleaseNotice(false);
      warningTimerRef.current = null;
    }, 1800);
  }, [clearWarningTimer]);

  const startRecording = useCallback(() => {
    recordingActiveRef.current = true;
    setState("recording");
    draftComboRef.current = EMPTY_COMBO;
    setDraftCombo(EMPTY_COMBO);
    rightModifierLatchRef.current = null;
    setInvalidReleaseNotice(false);
    window.api?.startHotkeyRecording();
  }, []);

  const cancelRecording = useCallback(() => {
    clearWarningTimer();
    recordingActiveRef.current = false;
    setState("idle");
    draftComboRef.current = EMPTY_COMBO;
    setDraftCombo(EMPTY_COMBO);
    rightModifierLatchRef.current = null;
    setInvalidReleaseNotice(false);
    window.api?.stopHotkeyRecording();
  }, [clearWarningTimer]);

  const completeRecording = useCallback(() => {
    const draft = draftComboRef.current;
    let accel = comboToAccelerator(draft);
    const latch = rightModifierLatchRef.current;
    if (
      accel &&
      latch &&
      draft.key === null &&
      draft.modifiers.length === 1 &&
      RIGHT_MODIFIER_TO_GENERIC[latch] === draft.modifiers[0]
    ) {
      accel = latch;
    }
    if (!accel) {
      if (draft.key || draft.modifiers.length > 0) {
        showInvalidReleaseNotice();
        window.api?.stopHotkeyRecording();
        recordingActiveRef.current = false;
        setState("idle");
        draftComboRef.current = EMPTY_COMBO;
        setDraftCombo(EMPTY_COMBO);
        rightModifierLatchRef.current = null;
      }
      return;
    }

    clearWarningTimer();
    if (accel) {
      onRecordRef.current(accel);
    }
    // Re-register the global listener with the new accelerator (single IPC)
    window.api?.stopHotkeyRecording(accel);
    recordingActiveRef.current = false;
    setState("idle");
    draftComboRef.current = EMPTY_COMBO;
    setDraftCombo(EMPTY_COMBO);
    rightModifierLatchRef.current = null;
    setInvalidReleaseNotice(false);
  }, [clearWarningTimer, showInvalidReleaseNotice]);

  const hasDraftCombo = useCallback(() => {
    return (
      draftComboRef.current.key !== null ||
      draftComboRef.current.modifiers.length > 0
    );
  }, []);

  // Global capture: native listener (all platforms) + DOM on macOS for Alt+Space etc.
  useEffect(() => {
    if (state !== "recording" || !window.api) return;

    const removeModifiers = window.api.onHotkeyRecordModifiers((modifiers) => {
      const rightToken =
        modifiers.length === 1 && RIGHT_MODIFIER_TO_GENERIC[modifiers[0]]
          ? modifiers[0]
          : null;
      const genericModifiers = modifiers.map(
        (m) => RIGHT_MODIFIER_TO_GENERIC[m] ?? m,
      );
      rightModifierLatchRef.current = nextRightModifierLatch(
        rightModifierLatchRef.current,
        draftComboRef.current,
        {
          rightToken,
          modifierCount: modifiers.length,
          genericModifiers,
          explicitLeft: false,
        },
      );
      updateDraftCombo((combo) => ({
        ...combo,
        modifiers: mergeModifiers(combo.modifiers, genericModifiers),
      }));
    });

    const removeCaptured = window.api.onHotkeyRecordCaptured((combo) => {
      rightModifierLatchRef.current = null;
      updateDraftCombo((current) => normalizeCapturedCombo(current, combo));
    });

    const removeReleased = window.api.onHotkeyRecordReleased(() => {
      if (!hasDraftCombo()) return;
      completeRecording();
    });

    const removeCancel = window.api.onHotkeyRecordCancel(() => {
      recordingActiveRef.current = false;
      setState("idle");
      draftComboRef.current = EMPTY_COMBO;
      setDraftCombo(EMPTY_COMBO);
      rightModifierLatchRef.current = null;
      setInvalidReleaseNotice(false);
    });

    return () => {
      removeModifiers();
      removeCaptured();
      removeReleased();
      removeCancel();
    };
  }, [state, completeRecording, hasDraftCombo, updateDraftCombo]);

  useEffect(() => {
    if (state !== "recording" || !USE_DOM_CAPTURE) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.key === "Escape") {
        cancelRecording();
        return;
      }

      const modifiers = modifiersFromEvent(e);

      if (isDomModifierKey(e)) {
        const rightToken = domRightModifierToken(e);
        // isDomModifierKey(e) is true here, so this is equivalent to the full
        // `isDomModifierKey(e) && domRightModifierToken(e) === null` check:
        // a DOM modifier keydown whose e.code definitively identifies the
        // left key (e.g. MetaLeft) is the only source that can assert "left".
        const explicitLeft = rightToken === null;
        rightModifierLatchRef.current = nextRightModifierLatch(
          rightModifierLatchRef.current,
          draftComboRef.current,
          {
            rightToken,
            modifierCount: modifiers.length,
            genericModifiers: modifiers,
            explicitLeft,
          },
        );
        updateDraftCombo((combo) => ({
          ...combo,
          modifiers: mergeModifiers(combo.modifiers, modifiers),
        }));
        return;
      }

      const key = domKeyFromEvent(e);
      if (!key) return;

      rightModifierLatchRef.current = null;
      updateDraftCombo((combo) => ({
        modifiers: mergeModifiers(combo.modifiers, modifiers),
        key,
      }));
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.key === "Escape") return;
      if (!hasDraftCombo()) return;
      completeRecording();
    };

    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("keyup", handleKeyUp, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("keyup", handleKeyUp, true);
    };
  }, [
    state,
    cancelRecording,
    completeRecording,
    hasDraftCombo,
    updateDraftCombo,
  ]);

  // Stop main process recording only if we started it (avoids re-registering hotkey on every settings navigation)
  useEffect(() => {
    return () => {
      clearWarningTimer();
      if (recordingActiveRef.current) {
        recordingActiveRef.current = false;
        window.api?.stopHotkeyRecording();
      }
    };
  }, [clearWarningTimer]);

  return {
    state,
    liveModifiers: draftCombo.modifiers,
    capturedCombo:
      draftCombo.modifiers.length > 0 || draftCombo.key ? draftCombo : null,
    canSaveRecording: isValidHotkeyCombo(draftCombo),
    needsModifierOrMouseButton: needsModifierOrMouseButton(
      draftCombo.key ? draftCombo : null,
    ),
    invalidReleaseNotice,
    startRecording,
    cancelRecording,
  };
}
