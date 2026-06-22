import { useCallback, useEffect, useState } from "react";
import type { CloudUser } from "../../../../shared/cloud-user";

export interface UseCloudAuth {
  user: CloudUser | null;
  loading: boolean;
  signingIn: boolean;
  /** Device user code, surfaced while a sign-in is pending. */
  userCode: string | null;
  error: string | null;
  signIn: () => Promise<CloudUser | null>;
  signOut: () => Promise<void>;
}

/** Renderer-side state for Freestyle Cloud sign-in (drives the OAuth device flow in main). */
export function useCloudAuth(): UseCloudAuth {
  const [user, setUser] = useState<CloudUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [userCode, setUserCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    window.api
      .getCloudUser()
      .then(setUser)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const signIn = useCallback(async (): Promise<CloudUser | null> => {
    setSigningIn(true);
    setError(null);
    setUserCode(null);
    const off = window.api.onCloudUserCode((code) => setUserCode(code));
    try {
      const u = await window.api.cloudSignIn();
      setUser(u);
      return u;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
      return null;
    } finally {
      off();
      setSigningIn(false);
      setUserCode(null);
    }
  }, []);

  const signOut = useCallback(async (): Promise<void> => {
    await window.api.cloudSignOut().catch(() => {});
    setUser(null);
  }, []);

  return { user, loading, signingIn, userCode, error, signIn, signOut };
}
