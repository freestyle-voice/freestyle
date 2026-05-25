import { cn } from "@renderer/lib/utils";
import {
  AlertTriangle,
  Check,
  ExternalLink,
  Mic,
  RefreshCw,
  Shield,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

type PermissionStatus = "unknown" | "granted" | "denied" | "not-determined";

const STATUS_LABELS: Record<PermissionStatus, string> = {
  unknown: "Checking...",
  granted: "Granted",
  denied: "Denied",
  "not-determined": "Not Requested",
};

export default function PermissionsPage(): React.JSX.Element {
  const [micStatus, setMicStatus] = useState<PermissionStatus>("unknown");
  const [accessibilityStatus, setAccessibilityStatus] = useState<
    boolean | null
  >(null);
  const [refreshing, setRefreshing] = useState(false);
  const accessibilityPollRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );
  const isMac = navigator.userAgent.includes("Mac");

  const checkAll = useCallback(async () => {
    setRefreshing(true);
    try {
      const mic = await window.api?.checkMicPermission();
      if (mic) setMicStatus(mic as PermissionStatus);
    } catch {
      // ignore
    }
    try {
      const acc = await window.api?.checkAccessibilityPermission();
      if (acc !== undefined) setAccessibilityStatus(acc);
    } catch {
      // ignore
    }
    setRefreshing(false);
  }, []);

  useEffect(() => {
    checkAll();
    return () => {
      if (accessibilityPollRef.current)
        clearInterval(accessibilityPollRef.current);
    };
  }, [checkAll]);

  const requestMic = useCallback(async () => {
    const status = await window.api?.requestMicPermission();
    if (status) setMicStatus(status as PermissionStatus);
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

  const allGranted = micStatus === "granted" && accessibilityStatus === true;

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Permissions</h1>
          <p className="text-muted-foreground mt-1">
            Freestyle needs these permissions to record audio and paste text
            into other apps.
          </p>
        </div>
        <button
          type="button"
          onClick={checkAll}
          disabled={refreshing}
          className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs transition-colors"
        >
          <RefreshCw
            className={cn("h-3.5 w-3.5", refreshing && "animate-spin")}
          />
          Refresh
        </button>
      </div>

      {allGranted ? (
        <div className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/5 px-4 py-3">
          <Check className="h-4 w-4 text-green-500" />
          <span className="text-sm">
            All permissions granted. Freestyle is ready to use.
          </span>
        </div>
      ) : micStatus !== "unknown" && accessibilityStatus !== null ? (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          <span className="text-sm">
            Some permissions are missing. Freestyle may not work correctly.
          </span>
        </div>
      ) : null}

      <div className="space-y-5">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Required
        </h2>

        <div className="border-border rounded-lg border p-4">
          <div className="flex items-start gap-3">
            <Mic className="text-muted-foreground mt-0.5 h-5 w-5 shrink-0" />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Microphone</span>
                <StatusBadge
                  granted={micStatus === "granted"}
                  label={STATUS_LABELS[micStatus]}
                />
              </div>
              <p className="text-muted-foreground mt-0.5 text-xs">
                Required to capture your voice for transcription.
                {!isMac &&
                  " On Windows and Linux, the browser will prompt you when you first record."}
              </p>
            </div>
            {micStatus === "granted" ? (
              <Check className="text-primary h-5 w-5 shrink-0" />
            ) : (
              <button
                type="button"
                onClick={requestMic}
                className="bg-primary text-primary-foreground hover:bg-primary/90 shrink-0 rounded px-3 py-1.5 text-xs font-medium"
              >
                {micStatus === "denied" ? "Re-request" : "Allow"}
              </button>
            )}
          </div>
        </div>

        <div className="border-border rounded-lg border p-4">
          <div className="flex items-start gap-3">
            <Shield className="text-muted-foreground mt-0.5 h-5 w-5 shrink-0" />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Accessibility</span>
                <StatusBadge
                  granted={accessibilityStatus === true}
                  label={
                    accessibilityStatus === null
                      ? "Checking..."
                      : accessibilityStatus
                        ? "Granted"
                        : "Not Granted"
                  }
                />
              </div>
              <p className="text-muted-foreground mt-0.5 text-xs">
                Required to detect the global hotkey and paste transcribed text
                into other apps.
                {isMac &&
                  " You need to enable Freestyle in System Settings > Privacy & Security > Accessibility."}
              </p>
            </div>
            {accessibilityStatus === true ? (
              <Check className="text-primary h-5 w-5 shrink-0" />
            ) : isMac ? (
              <button
                type="button"
                onClick={openAccessibility}
                className="bg-primary text-primary-foreground hover:bg-primary/90 flex shrink-0 items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium"
              >
                Open Settings
                <ExternalLink className="h-3 w-3" />
              </button>
            ) : (
              <span className="text-muted-foreground text-xs">
                Auto-granted
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-5">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Troubleshooting
        </h2>
        <div className="text-muted-foreground space-y-3 text-sm">
          <p>If Freestyle is not recording or pasting text:</p>
          <ol className="list-decimal space-y-1.5 pl-5">
            <li>Make sure microphone permission is granted above.</li>
            {isMac && (
              <li>
                Verify Freestyle is checked in System Settings &gt; Privacy
                &amp; Security &gt; Accessibility.
              </li>
            )}
            <li>
              Try quitting and reopening Freestyle after granting permissions.
            </li>
            <li>
              Check that your selected microphone is working in your system
              settings.
            </li>
          </ol>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ granted, label }: { granted: boolean; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
        granted
          ? "bg-green-500/10 text-green-600 dark:text-green-400"
          : "bg-amber-500/10 text-amber-600 dark:text-amber-400",
      )}
    >
      {granted ? (
        <Check className="h-2.5 w-2.5" />
      ) : (
        <X className="h-2.5 w-2.5" />
      )}
      {label}
    </span>
  );
}
