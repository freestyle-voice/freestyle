import { requestMicAccess } from "@renderer/lib/permissions";
import { HAS_NATIVE_DESKTOP, IS_MAC, IS_WINDOWS } from "@renderer/lib/platform";
import { useCallback, useEffect, useRef, useState } from "react";

export function useSetupPermissions() {
  const [mic, setMic] = useState("checking");
  const [accessibility, setAccessibility] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const grantedMic = useRef(false);
  const checkRevision = useRef(0);
  const refresh = useCallback(async () => {
    const revision = ++checkRevision.current;
    try {
      // Checking must never open a capture stream or trigger an OS prompt.
      let [microphone, paste] = await Promise.all([
        window.api?.checkMicPermission?.(),
        IS_MAC ? window.api?.checkAccessibilityPermission?.() : true,
      ]);
      if (!microphone || microphone === "unknown") {
        // Linux cannot report an OS microphone status. Querying permission is
        // passive; unlike getUserMedia it never opens a stream or a prompt.
        try {
          const permission = await navigator.permissions.query({
            name: "microphone" as PermissionName,
          });
          microphone =
            permission.state === "denied"
              ? "denied"
              : permission.state === "granted"
                ? "granted"
                : "not-determined";
        } catch {
          microphone = grantedMic.current ? "granted" : "unknown";
        }
      }
      if (revision !== checkRevision.current) return;
      grantedMic.current = microphone === "granted";
      setMic(microphone ?? "unknown");
      setAccessibility(paste ?? null);
      setError(null);
    } catch {
      if (revision !== checkRevision.current) return;
      setMic("unknown");
      setError(
        "Couldn’t check permissions. Check again or finish setup later.",
      );
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onFocus = () => {
      void refresh();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  useEffect(() => {
    if (!waiting) return;
    const interval = setInterval(() => {
      void refresh();
    }, 1000);
    const timeout = setTimeout(() => setWaiting(false), 30_000);
    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [refresh, waiting]);

  const request = async (kind: "mic" | "paste") => {
    checkRevision.current++;
    setBusy(true);
    setError(null);
    try {
      if (kind === "paste") {
        await window.api?.openAccessibilitySettings?.();
        setWaiting(true);
      } else if (
        HAS_NATIVE_DESKTOP &&
        (IS_MAC || IS_WINDOWS) &&
        (mic === "denied" || mic === "restricted")
      ) {
        await window.api?.openMicSettings?.();
        setWaiting(true);
      } else {
        const status = await requestMicAccess();
        checkRevision.current++;
        grantedMic.current = status === "granted";
        setMic(status);
      }
    } catch {
      setError(
        "Couldn’t open permission settings. Check your system settings, then try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  return { mic, accessibility, error, busy, waiting, refresh, request };
}
