/**
 * Cloud-synced cleanup preferences (member-scoped). The mobile app stores
 * preferences in AsyncStorage; these helpers mirror them to the cloud
 * `GET/PUT /preferences` endpoint so preferences follow the user across
 * devices. Authenticated with the stored session cookie, like `usage.ts`.
 */

import type {
  CloudMemberPreferences,
  MemberPreferencesInput,
} from "@freestyle-voice/validations";
import { cloudUrl } from "./config";
import { authHeaders, CloudAuthError } from "./session";

/** Fetch the signed-in member's cloud preferences (empty object if none). */
export async function fetchCloudPreferences(): Promise<CloudMemberPreferences> {
  const headers = authHeaders();
  if (!headers) throw new CloudAuthError();
  const res = await fetch(`${cloudUrl()}/preferences`, {
    method: "GET",
    headers,
    credentials: "omit",
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 401) throw new CloudAuthError();
  // 400 = no active org yet; treat as "nothing synced".
  if (res.status === 400) return {};
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
  const res = await fetch(`${cloudUrl()}/preferences`, {
    method: "PUT",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify(data),
    credentials: "omit",
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 401) throw new CloudAuthError();
  if (!res.ok) throw new Error(`Failed to sync preferences (${res.status})`);
}
