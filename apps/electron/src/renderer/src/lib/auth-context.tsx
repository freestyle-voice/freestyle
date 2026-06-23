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

export interface UseCloudAuth {
  user: CloudUser | null;
  loading: boolean;
  signingIn: boolean;
  /** Device user code, surfaced while a sign-in is pending. */
  userCode: string | null;
  error: string | null;
  refresh: () => Promise<CloudUser | null>;
  signIn: () => Promise<CloudUser | null>;
  /** Abort an in-flight sign-in (driven from the pending modal). */
  cancelSignIn: () => void;
  signOut: () => Promise<void>;
}

const CloudAuthContext = createContext<UseCloudAuth | null>(null);

/** Renderer-side state for Freestyle Cloud sign-in (drives the OAuth device flow in main). */
function useCloudAuthState(): UseCloudAuth {
  const [user, setUser] = useState<CloudUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [userCode, setUserCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef(false);
  const signInPromiseRef = useRef<Promise<CloudUser | null> | null>(null);
  const signInAttemptRef = useRef(0);

  const refresh = useCallback(async (): Promise<CloudUser | null> => {
    const user = await getClient()
      .api.auth.status.$get()
      .then(async (res) => {
        if (!res.ok) return null;
        const data = await res.json();
        return data.user ?? null;
      })
      .catch(() => null);
    setUser(user);
    return user;
  }, []);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

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
  }, []);

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
    setUser(null);
  }, []);

  return {
    user,
    loading,
    signingIn,
    userCode,
    error,
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
