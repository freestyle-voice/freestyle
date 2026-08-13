/**
 * Live installation status for the Freestyle voice keyboard.
 *
 * iOS gives apps no API to enable a custom keyboard or grant it Full Access —
 * the user must do both in Settings. But we *can* detect the end result: the
 * keyboard extension stamps a handshake into the shared App Group each time it
 * loads, and that write only succeeds when the extension has Full Access. So an
 * ever-present handshake is proof the keyboard was, at least once, enabled and
 * granted Full Access.
 *
 * Deliberate tradeoff — the signal is "sticky", not freshness-checked: the
 * timestamp is only written (on keyboard load) and never expires. Once it's
 * non-zero we report `"ready"` from then on, so *revoking* Full Access later is
 * not detected (iOS gives no revocation callback). We can't use a TTL either:
 * the value only updates when the keyboard is actually loaded, so a real but
 * simply-unused keyboard would false-negative and nag a correctly-configured
 * user. Reporting a stale "ready" is the lesser evil, and the keyboard's own
 * runtime paths surface the true state if Full Access is actually missing.
 *
 * The status is re-read whenever the app returns to the foreground (the user
 * flips the switch in Settings and comes back) and on a slow poll while a
 * consumer is mounted, so the guided setup UI updates itself the moment the
 * handshake first appears.
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

  return { status, ready: status === "ready" };
}
