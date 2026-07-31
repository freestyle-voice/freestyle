/**
 * Cloud-synced cleanup preferences (member-scoped). The mobile app stores
 * preferences in AsyncStorage; these helpers mirror them to the cloud
 * `GET/PUT /{org}/member/preferences` endpoint so preferences follow the user across
 * devices. Authenticated with the stored session cookie via the shared cloud
 * client, like `usage.ts`.
 */

import type {
  CloudMemberPreferences,
  MemberPreferencesInput,
} from "@freestyle-voice/validations";
import { cloud } from "./client";
import { resolveActiveOrgSlug } from "./org";
import { CloudRequestError } from "./session";

/** Fetch the signed-in member's cloud preferences (empty object if none). */
export async function fetchCloudPreferences(): Promise<CloudMemberPreferences> {
  const orgSlug = await resolveActiveOrgSlug();
  // No active org yet — treat as "nothing synced".
  if (!orgSlug) return {};
  try {
    return await cloud.json<CloudMemberPreferences>(
      `/${orgSlug}/member/preferences`,
      { method: "GET" },
    );
  } catch (err) {
    // 403/404 = no membership / unknown org; treat as "nothing synced".
    if (
      err instanceof CloudRequestError &&
      (err.status === 403 || err.status === 404)
    ) {
      return {};
    }
    throw err;
  }
}

/**
 * Push a partial preferences patch to the cloud. Only the fields present in
 * `data` are written; the nested `vocabulary` object is deep-merged upstream.
 */
export async function pushCloudPreferences(
  data: MemberPreferencesInput,
): Promise<void> {
  const orgSlug = await resolveActiveOrgSlug();
  if (!orgSlug) return; // no active org — nothing to push to
  // The cloud responds with `{ syncedAt? }`; json() also maps 401/!ok to the
  // shared error taxonomy (previously a bare `throw new Error` on !res.ok).
  await cloud.json<{ syncedAt?: string }>(`/${orgSlug}/member/preferences`, {
    method: "PUT",
    json: data,
  });
}
