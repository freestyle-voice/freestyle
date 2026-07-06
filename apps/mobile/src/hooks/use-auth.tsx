/**
 * Auth context: holds the Freestyle Cloud session token + user profile,
 * restores a stored token on launch, and exposes sign-in/sign-out.
 */

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  CloudAuthError,
  type CloudUser,
  fetchCloudUser,
  signOutCloud,
} from "@/lib/cloud/session";
import {
  clearStoredToken,
  getStoredToken,
  setStoredToken,
} from "@/lib/storage";

interface AuthState {
  token: string | null;
  user: CloudUser | null;
  /** True until the initial stored-token restore completes. */
  loading: boolean;
  signIn: (token: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<CloudUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const stored = await getStoredToken();
      if (!stored) {
        setLoading(false);
        return;
      }
      try {
        const profile = await fetchCloudUser(stored);
        setToken(stored);
        setUser(profile);
      } catch (err) {
        // A rejected token is cleared; anything else leaves the user signed
        // out for this launch but keeps the token for a later retry.
        if (err instanceof CloudAuthError) await clearStoredToken();
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const signIn = useCallback(async (nextToken: string) => {
    const profile = await fetchCloudUser(nextToken);
    await setStoredToken(nextToken);
    setToken(nextToken);
    setUser(profile);
  }, []);

  const signOut = useCallback(async () => {
    const current = token;
    setToken(null);
    setUser(null);
    await clearStoredToken();
    if (current) await signOutCloud(current);
  }, [token]);

  const value = useMemo<AuthState>(
    () => ({ token, user, loading, signIn, signOut }),
    [token, user, loading, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
