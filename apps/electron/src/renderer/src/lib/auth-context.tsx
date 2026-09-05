import {
  type QueryClient,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { CloudUser } from "../../../shared/cloud-user";
import { getClient, resolveApiBase, subscribeToUnauthorized } from "./api";
import { resetBrainCache } from "./brain-fs";
import { queryKeys } from "./query";

function resetAccountCaches(queryClient: QueryClient): void {
  resetBrainCache();
  queryClient.clear();
}

export interface UseCloudAuth {
  user: CloudUser | null;
  /** Whether the server has not yet definitively accepted or rejected the session. */
  phase: "checking" | "authenticated" | "signed_out";
  /** Read-only requests may use the stored bearer while the profile reconciles. */
  canRequestData: boolean;
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
  const [signingIn, setSigningIn] = useState(false);
  const [userCode, setUserCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [forcedSignedOut, setForcedSignedOut] = useState(false);
  const wasSignedInRef = useRef(false);
  const cancelledRef = useRef(false);
  const signInPromiseRef = useRef<Promise<CloudUser | null> | null>(null);
  const signInAttemptRef = useRef(0);
  const authStatusQuery = useQuery({
    queryKey: queryKeys.cloud.authStatus,
    queryFn: async (): Promise<{
      user: CloudUser | null;
      reached: boolean;
    }> => {
      await resolveApiBase();
      const response = await getClient().api.auth.status.$get();
      // Only a successfully decoded status response can declare the visitor
      // signed out. A timeout, offline error, or 5xx leaves the shell usable
      // and lets each requested resource report its own state.
      if (!response.ok) return { user: null, reached: false };
      const data = await response.json();
      return { user: data.user ?? null, reached: true };
    },
    retry: false,
    refetchOnWindowFocus: false,
  });

  const status = authStatusQuery.data;
  const { refetch: refetchAuthStatus } = authStatusQuery;
  const phase = forcedSignedOut
    ? "signed_out"
    : status?.reached
      ? status.user
        ? "authenticated"
        : "signed_out"
      : "checking";
  const user = phase === "authenticated" ? (status?.user ?? null) : null;
  const loading = phase === "checking";
  const canRequestData = phase !== "signed_out";

  useEffect(() => {
    if (!status?.reached) return;
    if (!status.user && wasSignedInRef.current) {
      setSessionExpired(true);
      queryClient.removeQueries({ queryKey: queryKeys.connectors.all });
    }
    if (status.user) setSessionExpired(false);
    wasSignedInRef.current = !!status.user;
  }, [queryClient, status]);

  useEffect(
    () =>
      subscribeToUnauthorized(() => {
        const wasSignedIn = wasSignedInRef.current;
        wasSignedInRef.current = false;
        setSessionExpired(wasSignedIn);
        setForcedSignedOut(true);
        resetAccountCaches(queryClient);
      }),
    [queryClient],
  );

  const refresh = useCallback(
    async (): Promise<CloudUser | null> =>
      (await refetchAuthStatus()).data?.user ?? null,
    [refetchAuthStatus],
  );

  useEffect(() => {
    const revalidate = (): void => {
      void refetchAuthStatus();
    };
    window.addEventListener("focus", revalidate);
    const timer = setInterval(revalidate, 5 * 60 * 1000);
    return () => {
      window.removeEventListener("focus", revalidate);
      clearInterval(timer);
    };
  }, [refetchAuthStatus]);

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
        resetAccountCaches(queryClient);
        wasSignedInRef.current = true;
        setSessionExpired(false);
        setForcedSignedOut(false);
        queryClient.setQueryData(queryKeys.cloud.authStatus, {
          user: data.user,
          reached: true,
        });
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
    setForcedSignedOut(true);
    resetAccountCaches(queryClient);
  }, [queryClient]);

  return {
    user,
    phase,
    canRequestData,
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
