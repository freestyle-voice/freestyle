import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { CloudUser } from "../../../shared/cloud-user";

export interface UseCloudAuth {
  user: CloudUser | null;
  loading: boolean;
  signingIn: boolean;
  /** Device user code, surfaced while a sign-in is pending. */
  userCode: string | null;
  error: string | null;
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

  useEffect(() => {
    window.api
      .getCloudUser()
      .then(setUser)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const signIn = useCallback(async (): Promise<CloudUser | null> => {
    cancelledRef.current = false;
    setSigningIn(true);
    setError(null);
    setUserCode(null);
    const off = window.api.onCloudUserCode((code) => setUserCode(code));
    try {
      const u = await window.api.cloudSignIn();
      setUser(u);
      return u;
    } catch (err) {
      if (!cancelledRef.current) {
        setError(err instanceof Error ? err.message : "Sign-in failed");
      }
      return null;
    } finally {
      off();
      setSigningIn(false);
      setUserCode(null);
    }
  }, []);

  const cancelSignIn = useCallback((): void => {
    cancelledRef.current = true;
    void window.api.cloudCancelSignIn();
  }, []);

  const signOut = useCallback(async (): Promise<void> => {
    await window.api.cloudSignOut().catch(() => {});
    setUser(null);
  }, []);

  return {
    user,
    loading,
    signingIn,
    userCode,
    error,
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
