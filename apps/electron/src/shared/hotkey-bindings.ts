export type HotkeyBindingKind = "hold" | "toggle";

export type HotkeyBindingError =
  | "invalid_kind"
  | "hold_required"
  | "invalid_accelerator"
  | "load_failed"
  | "save_failed";

export type HotkeyRecorderError = "recorder_failed";

export interface SetHotkeyBindingResult {
  ok: boolean;
  accelerator?: string | null;
  error?: HotkeyBindingError;
  conflictingKind?: HotkeyBindingKind;
}
