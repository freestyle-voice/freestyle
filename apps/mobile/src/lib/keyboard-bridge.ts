/**
 * Hands dictation results to the iOS keyboard extension.
 *
 * The keyboard can't use the microphone, so it opens this app to capture +
 * transcribe. When a dictation finishes, the app writes the final transcript
 * into the shared App Group container; the keyboard reads it (via
 * `SharedStore.swift`) when it reappears and inserts it into the host field.
 *
 * No-op on Android (the keyboard is iOS-only) and when the native module is
 * unavailable (e.g. running in Expo Go).
 */

import { Platform } from "react-native";

type Bridge = typeof import("../../modules/freestyle-shared-store");

let bridge: Bridge | null = null;
function getBridge(): Bridge | null {
  if (Platform.OS !== "ios") return null;
  if (bridge) return bridge;
  try {
    bridge = require("../../modules/freestyle-shared-store") as Bridge;
    return bridge;
  } catch {
    return null;
  }
}

/** Hand a freshly-dictated transcript to the keyboard for insertion. */
export function setPendingTranscript(text: string): void {
  getBridge()?.setPendingTranscript(text);
}

/** Clear all shared state (on explicit sign-out). */
export function clearKeyboardSession(): void {
  getBridge()?.clearSharedStore();
}
