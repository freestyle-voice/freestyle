import { useCallback, useEffect, useState } from "react";
import { AppState } from "react-native";

import {
  checkMicPermission,
  type MicPermission,
  requestMicPermission,
} from "./recorder";

/**
 * Keeps microphone permission honest after the user leaves for iOS Settings.
 * Permission screens do not remount when the app becomes active again, so a
 * one-time check can otherwise leave their UI stale and their action disabled.
 */
export function useMicPermission() {
  const [status, setStatus] = useState<MicPermission>("undetermined");

  const refresh = useCallback(async () => {
    try {
      setStatus(await checkMicPermission());
    } catch {
      setStatus("undetermined");
    }
  }, []);

  useEffect(() => {
    void refresh();
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active") void refresh();
    });
    return () => subscription.remove();
  }, [refresh]);

  const request = useCallback(async () => {
    try {
      const next =
        (await checkMicPermission()) === "granted"
          ? "granted"
          : await requestMicPermission();
      setStatus(next);
      return next;
    } catch {
      setStatus("undetermined");
      return "undetermined" as const;
    }
  }, []);

  return { status, refresh, request };
}
