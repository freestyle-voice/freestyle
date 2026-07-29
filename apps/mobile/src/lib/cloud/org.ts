/**
 * Organization actions on the Freestyle Cloud account. Built on the
 * `@better-auth/expo` client's `organizationClient` plugin, so it reuses the
 * same session cookie as sign-in. Every signed-in user has a default org set
 * as active by the cloud; the switcher only matters when a user belongs to
 * more than one.
 */

import { authClient } from "./auth-client";

/**
 * An organization the signed-in user belongs to. Derived from the better-auth
 * client's return type so it stays in sync with the SDK (e.g. `createdAt` is a
 * `Date`, not a string, on this client).
 */
export type Organization = NonNullable<
  Awaited<ReturnType<typeof authClient.organization.list>>["data"]
>[number];

/** List all organizations the signed-in user is a member of. */
export async function listOrganizations(): Promise<Organization[]> {
  const { data } = await authClient.organization.list();
  return data ?? [];
}

/** The user's active organization (or null when none is set). */
export async function getActiveOrganization() {
  const { data } = await authClient.organization.getFullOrganization();
  return data ?? null;
}

/** Switch the user's active organization. */
export async function setActiveOrganization(
  organizationId: string,
): Promise<{ error?: string }> {
  const { error } = await authClient.organization.setActive({
    organizationId,
  });
  return error
    ? { error: error.message ?? "Failed to switch organization" }
    : {};
}
