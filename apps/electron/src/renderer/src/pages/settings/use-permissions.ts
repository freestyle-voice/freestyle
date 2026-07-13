import { requestMicAccess, resolveMicStatus } from "@renderer/lib/permissions";
import { useCallback, useEffect, useRef, useState } from "react";

export type MicStatus =
  | "unknown"
  | "granted"
  | "denied"
  | "restricted"
  | "not-determined";

export interface PermissionsState {
  micStatus: MicStatus;
  accessibilityStatus: boolean | null;
  requestMic: () => Promise<void>;
  openMicSettings: () => void;
  openAccessibility: () => void;
}

/**
 * Microphone + accessibility permission status for the Permissions tab. Polls
 * the OS after deep-linking to system settings so the UI flips to "granted"
 * without a manual refresh. Transient status, not a persisted setting.
 */
export function usePermissions(): PermissionsState {
  const [micStatus, setMicStatus] = useState<MicStatus>("unknown");
  const [accessibilityStatus, setAccessibilityStatus] = useState<
    boolean | null
  >(null);
  const micPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const accessibilityPollRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );

  const checkPermissions = useCallback(async () => {
    try {
      const mic = await resolveMicStatus();
      if (mic) setMicStatus(mic as MicStatus);
    } catch {}
    try {
      const acc = await window.api?.checkAccessibilityPermission();
      if (acc !== undefined) setAccessibilityStatus(acc);
    } catch {}
  }, []);

  useEffect(() => {
    checkPermissions();
    return () => {
      if (micPollRef.current) clearInterval(micPollRef.current);
      if (accessibilityPollRef.current)
        clearInterval(accessibilityPollRef.current);
    };
  }, [checkPermissions]);

  const requestMic = useCallback(async () => {
    const status = await requestMicAccess();
    if (status) setMicStatus(status as MicStatus);
  }, []);

  const openMicSettings = useCallback(() => {
    window.api?.openMicSettings();
    if (micPollRef.current) clearInterval(micPollRef.current);
    micPollRef.current = setInterval(async () => {
      const mic = await window.api?.checkMicPermission();
      if (mic === "granted") {
        setMicStatus("granted");
        if (micPollRef.current) clearInterval(micPollRef.current);
        micPollRef.current = null;
      }
    }, 1000);
    setTimeout(() => {
      if (micPollRef.current) {
        clearInterval(micPollRef.current);
        micPollRef.current = null;
      }
    }, 30000);
  }, []);

  const openAccessibility = useCallback(() => {
    window.api?.openAccessibilitySettings();
    if (accessibilityPollRef.current)
      clearInterval(accessibilityPollRef.current);
    accessibilityPollRef.current = setInterval(async () => {
      const ok = await window.api?.checkAccessibilityPermission();
      if (ok) {
        setAccessibilityStatus(true);
        if (accessibilityPollRef.current)
          clearInterval(accessibilityPollRef.current);
        accessibilityPollRef.current = null;
      }
    }, 1000);
    setTimeout(() => {
      if (accessibilityPollRef.current) {
        clearInterval(accessibilityPollRef.current);
        accessibilityPollRef.current = null;
      }
    }, 30000);
  }, []);

  return {
    micStatus,
    accessibilityStatus,
    requestMic,
    openMicSettings,
    openAccessibility,
  };
}
