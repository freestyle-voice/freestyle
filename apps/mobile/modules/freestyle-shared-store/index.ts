/**
 * Bridge to the App Group container shared with the iOS keyboard extension.
 * The app writes the dictation result here; the keyboard (native Swift) reads
 * it via `SharedStore.swift` and inserts it into the host text field.
 *
 * On non-iOS platforms the native module is absent; callers should guard on
 * `Platform.OS === "ios"` (see `src/lib/keyboard-bridge.ts`).
 */
import FreestyleSharedStoreModule from "./src/FreestyleSharedStoreModule";

/** Hand a freshly-dictated transcript to the keyboard for insertion. */
export function setPendingTranscript(text: string): void {
  FreestyleSharedStoreModule.setPendingTranscript(text);
}

/** Remove all shared state (used on sign-out). */
export function clearSharedStore(): void {
  FreestyleSharedStoreModule.clear();
}
