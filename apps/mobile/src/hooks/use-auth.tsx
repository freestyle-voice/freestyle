/**
 * Thin auth facade over the `@better-auth/expo` client. Exposes the current
 * user, a loading flag while the cached session resolves, and sign-in
 * (social) / sign-out actions.
 *
 * Apple sign-in on iOS uses the native `expo-apple-authentication` sheet
 * (`ASAuthorizationController`) rather than the web OAuth browser flow: we get
 * an Apple identity token on-device and hand it to better-auth's ID-token path,
 * so there's no in-app browser round-trip. Google/GitHub (and Apple on any
 * non-iOS platform, though the button is hidden there) still use the browser
 * flow. This is required for App Store compliance and is a much better UX.
 */

import * as AppleAuthentication from "expo-apple-authentication";
import { useCallback } from "react";
import { Platform } from "react-native";

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
    // iOS: use the native Apple sheet + ID-token flow (no browser).
    if (provider === "apple" && Platform.OS === "ios") {
      return signInWithAppleNative();
    }

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

/**
 * Native "Sign in with Apple" via `expo-apple-authentication`, exchanged for a
 * Freestyle Cloud session through better-auth's ID-token path.
 *
 * The native sheet returns an Apple identity token (a JWT) on-device; passing it
 * to `signIn.social({ provider: "apple", idToken })` signs the user in directly
 * with no redirect/browser. Apple only returns the user's name/email on the
 * FIRST authorization, so we forward them when present for account creation.
 */
async function signInWithAppleNative(): Promise<{ error?: string }> {
  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });

    if (!credential.identityToken) {
      return { error: "Apple sign-in did not return an identity token." };
    }

    const { error } = await authClient.signIn.social({
      provider: "apple",
      idToken: { token: credential.identityToken },
    });
    return error ? { error: error.message ?? "Sign-in failed" } : {};
  } catch (err) {
    // The user tapping "Cancel" isn't an error worth surfacing.
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      err.code === "ERR_REQUEST_CANCELED"
    ) {
      return {};
    }
    return {
      error: err instanceof Error ? err.message : "Apple sign-in failed.",
    };
  }
}
