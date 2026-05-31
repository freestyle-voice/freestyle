import { useCallback, useEffect, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// Platform detection
// ---------------------------------------------------------------------------

const IS_MAC =
  typeof navigator !== "undefined" && /mac/i.test(navigator.platform);

// ---------------------------------------------------------------------------
// Key symbol maps
// ---------------------------------------------------------------------------

const MAC_MOD_SYMBOLS: Record<string, string> = {
  Control: "\u2303",
  Command: "\u2318",
  Alt: "\u2325",
  Shift: "\u21E7",
};

const OTHER_MOD_LABELS: Record<string, string> = {
  Control: "Ctrl",
  Command: "Super",
  Alt: "Alt",
  Shift: "Shift",
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

const MODIFIER_ORDER = ["Control", "Command", "Alt", "Shift"];

/** macOS: compound keys (Alt+Space) via DOM; Fn/right-mod via native IPC */
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

export function comboToAccelerator(combo: HotkeyCombo): string | null {
  if (!combo.key) return null;
  return [...combo.modifiers, combo.key].join("+");
}

export function acceleratorToCombo(accel: string): HotkeyCombo {
  const parts = accel.split("+").map((p) => p.trim());
  const key = parts[parts.length - 1];
  const modifiers: string[] = [];

  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (p === "CommandOrControl") {
      modifiers.push(IS_MAC ? "Command" : "Control");
    } else if (MODIFIER_ORDER.includes(p)) {
      modifiers.push(p);
    }
  }

  return {
    modifiers: MODIFIER_ORDER.filter((m) => modifiers.includes(m)),
    key,
  };
}

export function keyDisplayLabel(key: string): string {
  if (IS_MAC && MAC_MOD_SYMBOLS[key]) return MAC_MOD_SYMBOLS[key];
  if (!IS_MAC && OTHER_MOD_LABELS[key]) return OTHER_MOD_LABELS[key];
  if (KEY_SYMBOLS[key]) return KEY_SYMBOLS[key];
  return key;
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

type RecorderState = "idle" | "recording" | "captured";

interface UseHotkeyRecorderReturn {
  state: RecorderState;
  liveModifiers: string[];
  capturedCombo: HotkeyCombo | null;
  startRecording: () => void;
  cancelRecording: () => void;
  saveRecording: () => void;
}

export function useHotkeyRecorder(
  onRecord: (accelerator: string) => void,
): UseHotkeyRecorderReturn {
  const [state, setState] = useState<RecorderState>("idle");
  const [liveModifiers, setLiveModifiers] = useState<string[]>([]);
  const [capturedCombo, setCapturedCombo] = useState<HotkeyCombo | null>(null);
  const onRecordRef = useRef(onRecord);
  onRecordRef.current = onRecord;
  const recordingActiveRef = useRef(false);

  const startRecording = useCallback(() => {
    recordingActiveRef.current = true;
    setState("recording");
    setLiveModifiers([]);
    setCapturedCombo(null);
    window.api?.startHotkeyRecording();
  }, []);

  const cancelRecording = useCallback(() => {
    recordingActiveRef.current = false;
    setState("idle");
    setLiveModifiers([]);
    setCapturedCombo(null);
    window.api?.stopHotkeyRecording();
  }, []);

  const saveRecording = useCallback(() => {
    const accel = capturedCombo?.key ? comboToAccelerator(capturedCombo) : null;
    if (accel) {
      onRecordRef.current(accel);
    }
    // Re-register the global listener with the new accelerator (single IPC)
    window.api?.stopHotkeyRecording(accel ?? undefined);
    recordingActiveRef.current = false;
    setState("idle");
    setLiveModifiers([]);
    setCapturedCombo(null);
  }, [capturedCombo]);

  // Global capture: native listener (all platforms) + DOM on macOS for Alt+Space etc.
  useEffect(() => {
    if (state !== "recording" || !window.api) return;

    const removeModifiers = window.api.onHotkeyRecordModifiers((modifiers) => {
      setLiveModifiers(modifiers);
    });

    const removeCaptured = window.api.onHotkeyRecordCaptured((combo) => {
      setCapturedCombo(combo);
      setLiveModifiers([]);
      setState("captured");
    });

    const removeCancel = window.api.onHotkeyRecordCancel(() => {
      recordingActiveRef.current = false;
      setState("idle");
      setLiveModifiers([]);
      setCapturedCombo(null);
    });

    return () => {
      removeModifiers();
      removeCaptured();
      removeCancel();
    };
  }, [state]);

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
        setLiveModifiers(modifiers);
        return;
      }

      const key = domKeyFromEvent(e);
      if (!key) return;

      setCapturedCombo({ modifiers, key });
      setLiveModifiers([]);
      setState("captured");
      window.api?.pauseHotkeyRecording();
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [state, cancelRecording]);

  // Stop main process recording only if we started it (avoids re-registering hotkey on every settings navigation)
  useEffect(() => {
    return () => {
      if (recordingActiveRef.current) {
        recordingActiveRef.current = false;
        window.api?.stopHotkeyRecording();
      }
    };
  }, []);

  return {
    state,
    liveModifiers,
    capturedCombo,
    startRecording,
    cancelRecording,
    saveRecording,
  };
}
