import { useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { CloudUser } from "../../../shared/cloud-user";
import { getClient } from "./api";
import { queryKeys } from "./query";

export interface UseCloudAuth {
  user: CloudUser | null;
  loading: boolean;
  signingIn: boolean;
  /** Device user code, surfaced while a sign-in is pending. */
  userCode: string | null;
  error: string | null;
  sessionExpired: boolean;
  refresh: () => Promise<CloudUser | null>;
  signIn: () => Promise<CloudUser | null>;
  /** Abort an in-flight sign-in (driven from the pending modal). */
  cancelSignIn: () => void;
  signOut: () => Promise<void>;
}

const CloudAuthContext = createContext<UseCloudAuth | null>(null);

/** Renderer-side state for Freestyle Cloud sign-in (drives the OAuth device flow in main). */
function useCloudAuthState(): UseCloudAuth {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<CloudUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [userCode, setUserCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const wasSignedInRef = useRef(false);
  const cancelledRef = useRef(false);
  const signInPromiseRef = useRef<Promise<CloudUser | null> | null>(null);
  const signInAttemptRef = useRef(0);
  // Collapses concurrent status checks into one in-flight request. On a fresh
  // window the mount retry-loop and the `focus` listener (fired the moment the
  // just-shown window focuses) both call refreshInternal within the same tick —
  // without this they'd hit /api/auth/status twice back-to-back.
  const refreshInFlightRef = useRef<Promise<{
    user: CloudUser | null;
    reached: boolean;
  }> | null>(null);

  const refreshInternal = useCallback(async (): Promise<{
    user: CloudUser | null;
    reached: boolean;
  }> => {
    if (refreshInFlightRef.current) return refreshInFlightRef.current;
    const run = (async () => {
      let reached = false;
      const user = await getClient()
        .api.auth.status.$get()
        .then(async (res) => {
          if (!res.ok) return null;
          reached = true;
          const data = await res.json();
          return data.user ?? null;
        })
        .catch(() => null);
      if (reached) {
        if (!user && wasSignedInRef.current) setSessionExpired(true);
        if (user) setSessionExpired(false);
        wasSignedInRef.current = !!user;
        setUser(user);
      }
      return { user, reached };
    })();
    refreshInFlightRef.current = run;
    try {
      return await run;
    } finally {
      refreshInFlightRef.current = null;
    }
  }, []);

  const refresh = useCallback(
    async (): Promise<CloudUser | null> => (await refreshInternal()).user,
    [refreshInternal],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      for (let attempt = 0; attempt < 15 && !cancelled; attempt++) {
        const { reached } = await refreshInternal();
        if (reached) break;
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshInternal]);

  useEffect(() => {
    const revalidate = (): void => {
      void refreshInternal();
    };
    window.addEventListener("focus", revalidate);
    const timer = setInterval(revalidate, 5 * 60 * 1000);
    return () => {
      window.removeEventListener("focus", revalidate);
      clearInterval(timer);
    };
  }, [refreshInternal]);

  const signIn = useCallback(async (): Promise<CloudUser | null> => {
    if (signInPromiseRef.current) return signInPromiseRef.current;

    cancelledRef.current = false;
    const attempt = ++signInAttemptRef.current;
    setSigningIn(true);
    setError(null);
    setUserCode(null);

    const run = async (): Promise<CloudUser | null> => {
      const codeRes = await getClient().api.auth.device.code.$post();
      if (!codeRes.ok)
        throw new Error(`Could not start sign-in (${codeRes.status})`);
      const code = await codeRes.json();
      setUserCode(code.user_code);
      await window.api.openExternal(
        code.verification_uri_complete || code.verification_uri,
      );

      const deadline = Date.now() + code.expires_in * 1000;
      let intervalMs = Math.max(1, code.interval) * 1000;
      while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
        if (cancelledRef.current) return null;
        if (attempt !== signInAttemptRef.current) return null;
        const tokenRes = await getClient().api.auth.device.token.$post({
          json: { device_code: code.device_code },
        });
        if (tokenRes.status === 202) continue;
        if (tokenRes.status === 429) {
          intervalMs += 5000;
          continue;
        }
        if (!tokenRes.ok) {
          const body = (await tokenRes.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(body?.error ?? `Sign-in failed (${tokenRes.status})`);
        }
        const data = await tokenRes.json();
        if (attempt !== signInAttemptRef.current) return null;
        queryClient.removeQueries({ queryKey: queryKeys.cloud.usage });
        wasSignedInRef.current = true;
        setSessionExpired(false);
        setUser(data.user);
        return data.user;
      }
      throw new Error("Sign-in timed out. Please try again.");
    };

    signInPromiseRef.current = run()
      .catch((err) => {
        if (!cancelledRef.current) {
          setError(err instanceof Error ? err.message : "Sign-in failed");
        }
        return null;
      })
      .finally(() => {
        if (attempt === signInAttemptRef.current) {
          signInPromiseRef.current = null;
          setSigningIn(false);
          setUserCode(null);
        }
      });

    return signInPromiseRef.current;
  }, [queryClient]);

  const cancelSignIn = useCallback((): void => {
    cancelledRef.current = true;
    signInAttemptRef.current += 1;
    signInPromiseRef.current = null;
    setSigningIn(false);
    setUserCode(null);
  }, []);

  const signOut = useCallback(async (): Promise<void> => {
    await getClient()
      .api.auth["sign-out"].$post()
      .catch(() => {});
    wasSignedInRef.current = false;
    setSessionExpired(false);
    setUser(null);
    queryClient.removeQueries({ queryKey: queryKeys.cloud.usage });
  }, [queryClient]);

  return {
    user,
    loading,
    signingIn,
    userCode,
    error,
    sessionExpired,
    refresh,
    signIn,
    cancelSignIn,
    signOut,
  };
}

export function CloudAuthProvider({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  const value = useCloudAuthState();
  return (
    <CloudAuthContext.Provider value={value}>
      {children}
    </CloudAuthContext.Provider>
  );
}

export function useCloudAuth(): UseCloudAuth {
  const ctx = useContext(CloudAuthContext);
  if (!ctx) {
    throw new Error("useCloudAuth must be used within a CloudAuthProvider");
  }
  return ctx;
}
