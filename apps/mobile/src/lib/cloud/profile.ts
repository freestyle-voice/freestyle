/**
 * Profile actions on the Freestyle Cloud account: update the display name and
 * link social providers. Built directly on the `@better-auth/expo` client (the
 * same one that powers sign-in), so linking reuses its in-app-browser +
 * deep-link flow — and Apple on iOS uses the native ID-token path, mirroring
 * {@link useAuth}'s sign-in.
 */

import * as AppleAuthentication from "expo-apple-authentication";
import { Platform } from "react-native";

import { authClient } from "./auth-client";

export type SocialProvider = "google" | "github" | "apple";

export const SOCIAL_PROVIDERS: SocialProvider[] = ["github", "google", "apple"];

/** Update the signed-in user's display name. */
export async function updateName(name: string): Promise<{ error?: string }> {
  const { error } = await authClient.updateUser({ name: name.trim() });
  return error ? { error: error.message ?? "Failed to update profile" } : {};
}

/** The provider ids currently linked to the signed-in user. */
export async function listLinkedProviders(): Promise<string[]> {
  const { data } = await authClient.listAccounts();
  return data?.map((a) => a.providerId) ?? [];
}

/**
 * Unlink a social account from the signed-in user. Better Auth prevents
 * unlinking the last remaining account by default (avoids lockout).
 */
export async function unlinkProvider(
  provider: SocialProvider,
): Promise<{ error?: string }> {
  const { error } = await authClient.unlinkAccount({ providerId: provider });
  return error
    ? { error: error.message ?? "Failed to disconnect account" }
    : {};
}

/**
 * Link a social account. iOS Apple uses the native sheet + ID-token flow (no
 * browser); everything else opens the in-app browser and resolves on the
 * deep-link callback, exactly like sign-in.
 */
export async function linkProvider(
  provider: SocialProvider,
): Promise<{ error?: string }> {
  if (provider === "apple" && Platform.OS === "ios") {
    return linkAppleNative();
  }

  const { error } = await authClient.linkSocial({
    provider,
    callbackURL: "/profile",
  });
  return error ? { error: error.message ?? "Failed to link account" } : {};
}

/** Native Apple linking via `expo-apple-authentication` + better-auth ID token. */
async function linkAppleNative(): Promise<{ error?: string }> {
  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });

    if (!credential.identityToken) {
      return { error: "Apple did not return an identity token." };
    }

    const { error } = await authClient.linkSocial({
      provider: "apple",
      idToken: { token: credential.identityToken },
    });
    return error ? { error: error.message ?? "Failed to link account" } : {};
  } catch (err) {
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      err.code === "ERR_REQUEST_CANCELED"
    ) {
      return {};
    }
    return {
      error: err instanceof Error ? err.message : "Apple linking failed.",
    };
  }
}
