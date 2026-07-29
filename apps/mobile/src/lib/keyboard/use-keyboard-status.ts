/**
 * Live installation status for the Freestyle voice keyboard.
 *
 * iOS gives apps no API to enable a custom keyboard or grant it Full Access —
 * the user must do both in Settings. But we *can* detect the end result: the
 * keyboard extension stamps a handshake into the shared App Group each time it
 * loads, and that write only succeeds when the extension has Full Access. So a
 * recent (or ever-present) handshake is honest proof the keyboard is enabled
 * and has Full Access.
 *
 * The status is re-read whenever the app returns to the foreground (the user
 * flips the switch in Settings and comes back) and on a slow poll while the
 * screen is mounted, so the guided setup UI updates itself.
 */

import { useCallback, useEffect, useState } from "react";
import { AppState, Platform } from "react-native";

import { keyboardLastActive } from "./dictation-bridge";

export type KeyboardStatus =
  | "unsupported" // not iOS, or the native bridge isn't available (Expo Go)
  | "not-enabled" // never handshaked: keyboard not added or missing Full Access
  | "ready"; // enabled + Full Access proven by an App Group handshake

/** How often to re-read the handshake while the setup screen is open. */
const POLL_MS = 1500;

function readStatus(): KeyboardStatus {
  if (Platform.OS !== "ios") return "unsupported";
  const lastActive = keyboardLastActive();
  // `null` → bridge unavailable (Expo Go); `0` → keyboard never ran with Full
  // Access; any positive timestamp → it has, so it's fully set up.
  if (lastActive == null) return "unsupported";
  return lastActive > 0 ? "ready" : "not-enabled";
}

export interface KeyboardStatusResult {
  status: KeyboardStatus;
  /** True once the keyboard is enabled and has Full Access. */
  ready: boolean;
  /** Force a re-read (e.g. after returning from Settings). */
  refresh: () => void;
}

export function useKeyboardStatus(): KeyboardStatusResult {
  const [status, setStatus] = useState<KeyboardStatus>(readStatus);

  const refresh = useCallback(() => setStatus(readStatus()), []);

  useEffect(() => {
    // Nothing to poll or observe when the keyboard can't exist on this platform.
    if (Platform.OS !== "ios") return;

    refresh();

    const poll = setInterval(refresh, POLL_MS);
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") refresh();
    });

    return () => {
      clearInterval(poll);
      sub.remove();
    };
  }, [refresh]);

  return { status, ready: status === "ready", refresh };
}
