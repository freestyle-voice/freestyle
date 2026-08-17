export type DictationPermission = "accessibility" | "microphone";

export interface AccessibilityPermissionState {
  granted: boolean;
  accessibilityConfirmed: boolean;
}

/**
 * The live macOS trust result is authoritative. The listener confirmation
 * latch may record a prior successful start, but it must never override a
 * currently untrusted system state.
 */
export function resolveAccessibilityPermission(
  platform: NodeJS.Platform,
  trusted: boolean,
  accessibilityConfirmed: boolean,
): AccessibilityPermissionState {
  if (platform !== "darwin") {
    return { granted: true, accessibilityConfirmed };
  }
  return {
    granted: trusted,
    accessibilityConfirmed: trusted ? accessibilityConfirmed : false,
  };
}

export function missingDictationPermission(
  platform: NodeJS.Platform,
  accessibilityGranted: boolean,
  microphoneStatus: string,
): DictationPermission | null {
  if (platform === "darwin" && !accessibilityGranted) {
    return "accessibility";
  }
  if (
    platform !== "linux" &&
    (microphoneStatus === "denied" || microphoneStatus === "restricted")
  ) {
    return "microphone";
  }
  return null;
}
