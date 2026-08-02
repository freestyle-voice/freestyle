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

/**
 * The cloud's canonical vocabulary term list, or `undefined` when the snapshot
 * carries no `vocabulary` object at all.
 *
 * The distinction matters for the two-way mirror: `undefined` means "nothing
 * synced yet" and MUST leave the local list untouched (a first launch / signed-
 * out state must never wipe local terms), whereas an explicit empty array means
 * the user cleared their list on another device and the delete should mirror
 * down. `fetchCloudPreferences` already maps "no membership / no org" to `{}`,
 * so those cases surface here as `undefined` too.
 */
export async function fetchCloudVocabularyTerms(): Promise<
  string[] | undefined
> {
  const prefs = await fetchCloudPreferences();
  const vocab = prefs.vocabulary;
  if (!vocab || !Array.isArray(vocab.terms)) return undefined;
  return vocab.terms;
}

/**
 * Replace the cloud's stored vocabulary term list with `terms`. The cloud
 * overwrites its `terms` array wholesale, so sending the full local list is what
 * propagates local adds AND deletes. No-op when signed out / no active org
 * (handled by `pushCloudPreferences`).
 */
export async function pushCloudVocabularyTerms(terms: string[]): Promise<void> {
  await pushCloudPreferences({ vocabulary: { terms } });
}
