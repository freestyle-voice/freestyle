/**
 * Thin auth facade over the `@better-auth/expo` client. Exposes the current
 * user, a loading flag while the cached session resolves, and sign-in
 * (social) / sign-out actions.
 */

import { useCallback } from "react";

import { authClient } from "@/lib/cloud/auth-client";
import { type CloudUser, signOutCloud } from "@/lib/cloud/session";
import { clearKeyboardSession } from "@/lib/keyboard-bridge";

export type SocialProvider = "google" | "github" | "apple";

interface AuthState {
  user: CloudUser | null;
  /** True until the cached session has resolved on launch. */
  loading: boolean;
  /** True when a signed-in session exists. */
  signedIn: boolean;
  signInWith: (provider: SocialProvider) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
}

export function useAuth(): AuthState {
  const { data: session, isPending } = authClient.useSession();

  const signInWith = useCallback(async (provider: SocialProvider) => {
    // On native, the expo client opens an in-app browser and resolves once the
    // deep-link callback lands; it does not navigate for us. `useSession` then
    // updates reactively, so callers just await this and let routing follow.
    const { error } = await authClient.signIn.social({
      provider,
      callbackURL: "/",
    });
    return error ? { error: error.message ?? "Sign-in failed" } : {};
  }, []);

  const signOut = useCallback(async () => {
    await signOutCloud();
    clearKeyboardSession();
  }, []);

  const user = session?.user
    ? {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
        image: session.user.image,
      }
    : null;

  return {
    user,
    loading: isPending,
    signedIn: !!session?.user,
    signInWith,
    signOut,
  };
}
