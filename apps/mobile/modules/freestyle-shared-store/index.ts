/**
 * Bridge to the App Group container shared with the iOS keyboard extension.
 *
 * iOS blocks mic capture in keyboard extensions, so the app owns the mic and
 * the keyboard drives it over a small bidirectional protocol in the App Group:
 *   • the app publishes session state (`writeState` / `touchHeartbeat`),
 *   • the keyboard posts commands the app reads (`loadCommand` / `clearCommand`)
 *     and reacts to instantly via the `onCommand` event,
 *   • `resetState` clears the channel on sign-out.
 *
 * A legacy one-shot hand-off (`setPendingTranscript`) is kept for the in-app
 * dictate fallback.
 *
 * On non-iOS platforms the native module is absent; callers should guard on
 * `Platform.OS === "ios"` (see `src/lib/keyboard/dictation-bridge.ts`).
 */
import FreestyleSharedStoreModule, {
  type DictationStateInput,
  type KeyboardCommand,
} from "./src/FreestyleSharedStoreModule";

export type { DictationStateInput, KeyboardCommand };

/** Publish a full session snapshot for the keyboard (stamps the heartbeat). */
export function writeState(state: DictationStateInput): void {
  FreestyleSharedStoreModule.writeState(state);
}

/** Refresh only the mic level + heartbeat (called per audio frame). */
export function updateLevel(level: number): void {
  FreestyleSharedStoreModule.updateLevel(level);
}

/** Refresh only the heartbeat (cheap keep-alive between full writes). */
export function touchHeartbeat(): void {
  FreestyleSharedStoreModule.touchHeartbeat();
}

/** Clear the state channel back to idle. */
export function resetState(): void {
  FreestyleSharedStoreModule.resetState();
}

/** Read the keyboard's latest command, or null when the channel is empty. */
export function loadCommand(): KeyboardCommand | null {
  return FreestyleSharedStoreModule.loadCommand();
}

/** Clear the command channel after handling a command. */
export function clearCommand(): void {
  FreestyleSharedStoreModule.clearCommand();
}

/** Subscribe to keyboard commands. Returns an unsubscribe function. */
export function addCommandListener(
  listener: (command: KeyboardCommand) => void,
): () => void {
  const subscription = FreestyleSharedStoreModule.addListener(
    "onCommand",
    listener,
  );
  return () => subscription.remove();
}

/** Legacy one-shot hand-off: publish a ready transcript with no session. */
export function setPendingTranscript(text: string): void {
  FreestyleSharedStoreModule.setPendingTranscript(text);
}

/** Remove all shared state (used on sign-out). */
export function clearSharedStore(): void {
  FreestyleSharedStoreModule.clear();
}
