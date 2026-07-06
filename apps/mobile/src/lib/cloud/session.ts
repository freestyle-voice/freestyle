/**
 * Freestyle Cloud session helpers: verify a stored token and resolve the
 * user's profile, and revoke the session on sign-out.
 */

import { createCloudAuthClient } from "./auth-client";
import { cloudUrl } from "./config";

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

function authStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const status = (error as { status?: unknown }).status;
  return typeof status === "number" ? status : undefined;
}

/** Resolve the signed-in user for a bearer token. Throws {@link CloudAuthError} on 401. */
export async function fetchCloudUser(token: string): Promise<CloudUser> {
  const { data, error } = await createCloudAuthClient().getSession({
    fetchOptions: {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000),
    },
  });
  if (authStatus(error) === 401) throw new CloudAuthError();
  if (error || !data?.user) {
    throw new Error("Failed to load Freestyle profile");
  }
  const { id, email, name, image } = data.user;
  return { id, email, name, image };
}

/** Best-effort session revocation. Ignores network failures on sign-out. */
export async function signOutCloud(token: string): Promise<void> {
  try {
    await fetch(`${cloudUrl()}/auth/sign-out`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    // Sign-out is local-first: clearing the stored token is what matters.
  }
}
