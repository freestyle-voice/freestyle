/**
 * Keeps the iOS keyboard extension in sync with the app.
 *
 * The extension is a separate native process with no JS runtime, so it can't
 * reach the better-auth client. On sign-in and whenever settings change, we
 * write the session token, cloud base URL, and cleanup/language prefs into the
 * shared App Group container; the keyboard reads them via `SharedStore.swift`
 * and authenticates to `/v2/stream` with `Authorization: Bearer <token>`.
 *
 * No-op on Android (the keyboard is iOS-only in v1) and when the native module
 * is unavailable (e.g. running in Expo Go).
 */

import { Platform } from "react-native";
import { DEFAULT_INTENSITY } from "@/lib/cleanup-tones";
import { authClient } from "@/lib/cloud/auth-client";
import { cloudUrl } from "@/lib/cloud/config";
import type { DictationSettings } from "@/lib/settings";
import { languageHint, tonesForCloud } from "@/lib/settings";

type Bridge = typeof import("../../modules/freestyle-shared-store");

let bridge: Bridge | null = null;
function getBridge(): Bridge | null {
  if (Platform.OS !== "ios") return null;
  if (bridge) return bridge;
  try {
    bridge = require("../../modules/freestyle-shared-store") as Bridge;
    return bridge;
  } catch {
    return null;
  }
}

/**
 * Extract the raw better-auth session token from the stored cookie string.
 * The bearer plugin accepts this value directly as `Bearer <token>`.
 */
function sessionTokenFromCookie(): string | null {
  const cookie = authClient.getCookie();
  if (!cookie) return null;
  for (const part of cookie.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name.endsWith("session_token")) {
      const value = rest.join("=");
      return value ? decodeURIComponent(value) : null;
    }
  }
  return null;
}

/** Push the current session token (or clear it when signed out). */
export function syncKeyboardSession(): void {
  const b = getBridge();
  if (!b) return;
  const token = sessionTokenFromCookie();
  b.setSharedValues({
    sessionToken: token,
    cloudBaseURL: cloudUrl(),
  });
}

/** Push the current dictation preferences to the keyboard. */
export function syncKeyboardSettings(settings: DictationSettings): void {
  const b = getBridge();
  if (!b) return;
  const tones = tonesForCloud(settings);
  b.setSharedValues({
    language: languageHint(settings.language) ?? "",
    intensity: DEFAULT_INTENSITY,
    personalTone: tones.personalTone,
    workTone: tones.workTone,
    emailTone: tones.emailTone,
    overallTone: tones.overallTone,
  });
  b.setSharedBool("skipPostProcess", !settings.cleanup);
}

/** Clear all shared state (on explicit sign-out). */
export function clearKeyboardSession(): void {
  getBridge()?.clearSharedStore();
}
