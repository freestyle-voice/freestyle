/**
 * Cloud-synced cleanup preferences (member-scoped). The mobile app stores
 * preferences in AsyncStorage; these helpers mirror them to the cloud
 * `GET/PUT /{org}/preferences` endpoint so preferences follow the user across
 * devices. Authenticated with the stored session cookie, like `usage.ts`.
 */

import type {
  CloudMemberPreferences,
  MemberPreferencesInput,
} from "@freestyle-voice/validations";
import { cloudUrl } from "./config";
import { resolveActiveOrgSlug } from "./org";
import { authHeaders, CloudAuthError } from "./session";

/** Fetch the signed-in member's cloud preferences (empty object if none). */
export async function fetchCloudPreferences(): Promise<CloudMemberPreferences> {
  const headers = authHeaders();
  if (!headers) throw new CloudAuthError();
  const orgSlug = await resolveActiveOrgSlug();
  // No active org yet — treat as "nothing synced".
  if (!orgSlug) return {};
  const res = await fetch(`${cloudUrl()}/${orgSlug}/preferences`, {
    method: "GET",
    headers,
    credentials: "omit",
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 401) throw new CloudAuthError();
  // 403/404 = no membership / unknown org; treat as "nothing synced".
  if (res.status === 403 || res.status === 404) return {};
  if (!res.ok) throw new Error(`Failed to load preferences (${res.status})`);
  return (await res.json()) as CloudMemberPreferences;
}

/**
 * Push a partial preferences patch to the cloud. Only the fields present in
 * `data` are written; the nested `vocabulary` object is deep-merged upstream.
 */
export async function pushCloudPreferences(
  data: MemberPreferencesInput,
): Promise<void> {
  const headers = authHeaders();
  if (!headers) throw new CloudAuthError();
  const orgSlug = await resolveActiveOrgSlug();
  if (!orgSlug) return; // no active org — nothing to push to
  const res = await fetch(`${cloudUrl()}/${orgSlug}/preferences`, {
    method: "PUT",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify(data),
    credentials: "omit",
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 401) throw new CloudAuthError();
  if (!res.ok) throw new Error(`Failed to sync preferences (${res.status})`);
}
