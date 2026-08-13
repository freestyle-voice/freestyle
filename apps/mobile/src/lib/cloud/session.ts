/**
 * Freestyle Cloud session helpers built on the `@better-auth/expo` client.
 *
 * The expo client owns the session (stored in SecureStore) and exposes it via
 * `authClient.useSession()`. For manual/authenticated `fetch` calls we attach
 * the stored cookie through {@link authHeaders}.
 */

import {
  CloudAuthError,
  CloudRequestError,
  CloudUsageError,
} from "@freestyle-voice/utils/cloud";
import { authClient } from "./auth-client";
import { clearCachedOrgSlug } from "./org";

export interface CloudUser {
  id: string;
  email: string;
  name?: string | null;
  image?: string | null;
}

// The shared client owns the cloud error taxonomy now. Re-export from here so
// existing imports (`import { CloudAuthError } from "./session"`) keep working
// and gain `CloudRequestError`/`CloudUsageError` (429 + non-2xx handling).
export { CloudAuthError, CloudRequestError, CloudUsageError };

/**
 * Headers that carry the better-auth session cookie for authenticated
 * requests. Returns null when there is no stored session.
 */
export function authHeaders(): Record<string, string> | null {
  const cookie = authClient.getCookie();
  return cookie ? { Cookie: cookie } : null;
}

/** Revoke the current session (server + local keychain). */
export async function signOutCloud(): Promise<void> {
  try {
    await authClient.signOut();
  } catch {
    // Sign-out is local-first: the expo client clears the stored session even
    // if the network call fails.
  } finally {
    // Drop the cached active-org slug so a subsequent sign-in resolves fresh.
    clearCachedOrgSlug();
  }
}
