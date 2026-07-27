/**
 * App-side bridge to the iOS keyboard extension's dictation protocol.
 *
 * iOS blocks mic capture in keyboard extensions, so the app owns the mic and
 * the keyboard drives it over a bidirectional protocol in the shared App Group
 * (see `modules/freestyle-shared-store` and the Swift `FreestyleDictationBridge`).
 * This module wraps the native module with a platform-safe facade: every call
 * is a no-op on Android (the keyboard is iOS-only) and when the native module
 * is unavailable (e.g. running in Expo Go).
 */

import { Platform } from "react-native";

type Bridge = typeof import("../../../modules/freestyle-shared-store");

export type Phase =
  | "idle"
  | "arming"
  | "armed"
  | "capturing"
  | "transcribing"
  | "ready"
  | "failed";

export type CommandKind =
  | "start"
  | "beginCapture"
  | "commit"
  | "cancelCapture"
  | "ackInsert"
  | "disarm";

export interface KeyboardCommand {
  kind: CommandKind;
  token: string;
  ackInsertionToken: string;
  updatedAt: number;
}

export interface DictationState {
  phase: Phase;
  sessionID: string;
  partialTranscript: string;
  finalTranscript: string;
  insertionToken: string;
  statusMessage: string;
  /** Live mic input level in [0, 1] for the keyboard's meter. */
  level: number;
}

const EMPTY_STATE: DictationState = {
  phase: "idle",
  sessionID: "",
  partialTranscript: "",
  finalTranscript: "",
  insertionToken: "",
  statusMessage: "",
  level: 0,
};

let bridge: Bridge | null = null;
let resolved = false;
function getBridge(): Bridge | null {
  if (Platform.OS !== "ios") return null;
  if (resolved) return bridge;
  resolved = true;
  try {
    bridge = require("../../../modules/freestyle-shared-store") as Bridge;
  } catch {
    bridge = null;
  }
  return bridge;
}

/** True when the resident-keyboard bridge is available (iOS + native module). */
export function isKeyboardBridgeAvailable(): boolean {
  return getBridge() != null;
}

/** Publish a full session snapshot for the keyboard (stamps the heartbeat). */
export function writeState(
  state: Partial<DictationState> & { phase: Phase },
): void {
  getBridge()?.writeState({ ...EMPTY_STATE, ...state });
}

/** Refresh only the heartbeat (cheap keep-alive between full writes). */
export function touchHeartbeat(): void {
  getBridge()?.touchHeartbeat();
}

/** Forward the live mic level (0–1) for the keyboard meter (per audio frame). */
export function updateLevel(level: number): void {
  getBridge()?.updateLevel(level);
}

/** Clear the state channel back to idle. */
export function resetState(): void {
  getBridge()?.resetState();
}

/** Read the keyboard's latest command, or null when the channel is empty. */
export function loadCommand(): KeyboardCommand | null {
  return getBridge()?.loadCommand() ?? null;
}

/** Clear the command channel after handling a command. */
export function clearCommand(): void {
  getBridge()?.clearCommand();
}

/** Subscribe to keyboard commands. Returns an unsubscribe function (no-op when
 * the bridge is unavailable). */
export function addCommandListener(
  listener: (command: KeyboardCommand) => void,
): () => void {
  return getBridge()?.addCommandListener(listener) ?? (() => {});
}

/**
 * Legacy one-shot hand-off: publish a ready transcript with no live session.
 * Kept for the in-app dictate fallback path.
 */
export function setPendingTranscript(text: string): void {
  getBridge()?.setPendingTranscript(text);
}

/** Clear all shared state (on explicit sign-out). */
export function clearKeyboardSession(): void {
  getBridge()?.clearSharedStore();
}
