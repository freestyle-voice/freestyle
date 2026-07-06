/**
 * Bridge to the App Group container shared with the iOS keyboard extension.
 * The keyboard (native Swift) reads these values via `SharedStore.swift`.
 *
 * On non-iOS platforms the native module is absent; callers should guard on
 * `Platform.OS === "ios"` (see `src/lib/keyboard-bridge.ts`).
 */
import FreestyleSharedStoreModule from "./src/FreestyleSharedStoreModule";

export function setSharedValues(values: Record<string, string | null>): void {
  FreestyleSharedStoreModule.setValues(values);
}

export function setSharedBool(key: string, value: boolean): void {
  FreestyleSharedStoreModule.setBool(key, value);
}

export function clearSharedStore(): void {
  FreestyleSharedStoreModule.clear();
}
