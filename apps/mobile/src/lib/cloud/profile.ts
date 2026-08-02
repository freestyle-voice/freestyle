/**
 * Profile actions on the Freestyle Cloud account: update the display name and
 * link social providers. Built directly on the `@better-auth/expo` client (the
 * same one that powers sign-in), so linking reuses its in-app-browser +
 * deep-link flow — and Apple on iOS uses the native ID-token path, mirroring
 * {@link useAuth}'s sign-in.
 */

import type { CloudProfile, ProfileInput } from "@freestyle-voice/validations";
import * as AppleAuthentication from "expo-apple-authentication";
import { Platform } from "react-native";
import { authClient } from "./auth-client";
import { cloud } from "./client";
import { resolveActiveOrgSlug } from "./org";

export type SocialProvider = "google" | "github" | "apple";

export const SOCIAL_PROVIDERS: SocialProvider[] = ["github", "google", "apple"];

/** Update the signed-in user's display name. */
export async function updateName(name: string): Promise<{ error?: string }> {
  const { error } = await authClient.updateUser({ name: name.trim() });
  return error ? { error: error.message ?? "Failed to update profile" } : {};
}

/**
 * Fetch the signed-in member's profile fields (industry/company/jobTitle) for
 * the active organization. Returns an empty profile when there is no active org
 * yet. Served by the cloud member preferences endpoint.
 */
export async function getProfileFields(): Promise<CloudProfile> {
  const orgSlug = await resolveActiveOrgSlug();
  if (!orgSlug) return {} as CloudProfile;
  // Auth + 401/!ok handling live in the shared cloud client.
  return cloud.json<CloudProfile>(`/${orgSlug}/member/preferences`, {
    method: "GET",
  });
}

/**
 * Update the signed-in member's profile fields for the active organization.
 * When the industry changes the cloud re-seeds tone + vocabulary defaults.
 */
export async function updateProfileFields(
  data: ProfileInput,
): Promise<CloudProfile> {
  const orgSlug = await resolveActiveOrgSlug();
  // Stricter than preferences: a profile update with no active org is an error.
  if (!orgSlug) throw new Error("No active organization");
  await cloud.json(`/${orgSlug}/member/preferences`, {
    method: "PUT",
    json: data,
  });
  return getProfileFields();
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
