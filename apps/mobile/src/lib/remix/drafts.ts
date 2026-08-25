import { getJsonPref, setJsonPref } from "@/lib/storage";

export type RemixDrafts = Record<string, string>;

export function remixDraftStorageKey(
  userId: string | null | undefined,
): string {
  return userId ? `remix_drafts:${userId}` : "remix_drafts";
}

export async function loadRemixDrafts(
  userId: string | null | undefined,
): Promise<RemixDrafts> {
  return getJsonPref<RemixDrafts>(remixDraftStorageKey(userId), {});
}

export async function saveRemixDrafts(
  userId: string | null | undefined,
  drafts: RemixDrafts,
): Promise<void> {
  await setJsonPref(remixDraftStorageKey(userId), drafts);
}

/** A blank draft removes its entry, keeping the account-scoped preference small. */
export function updateRemixDraft(
  drafts: RemixDrafts,
  threadId: string,
  value: string,
): RemixDrafts {
  const next = { ...drafts };
  if (value) next[threadId] = value;
  else delete next[threadId];
  return next;
}
