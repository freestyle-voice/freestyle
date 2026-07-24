/**
 * Freestyle Cloud session helpers built on the `@better-auth/expo` client.
 *
 * The expo client owns the session (stored in SecureStore) and exposes it via
 * `authClient.useSession()`. For manual/authenticated `fetch` calls we attach
 * the stored cookie through {@link authHeaders}.
 */

import { authClient } from "./auth-client";

export interface CloudUser {
  id: string;
  email: string;
  name?: string | null;
  image?: string | null;
}

export class CloudAuthError extends Error {
  constructor(message = "Freestyle Cloud sign-in required") {
    super(message);
    this.name = "CloudAuthError";
  }
}

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
  }
}
