export type DeletionConfirmationScope = "schedule" | "session";

const STORAGE_KEYS: Record<DeletionConfirmationScope, string> = {
  schedule: "freestyle.skip-schedule-delete-confirmation",
  session: "freestyle.skip-session-delete-confirmation",
};

/**
 * Deletion confirmation is a device-local convenience preference. Keeping the
 * scopes distinct means approving quick schedule cleanup never weakens the
 * protection around a Remix conversation, or vice versa.
 */
export function shouldSkipDeletionConfirmation(
  scope: DeletionConfirmationScope,
): boolean {
  try {
    return localStorage.getItem(STORAGE_KEYS[scope]) === "true";
  } catch {
    return false;
  }
}

export function setDeletionConfirmationSkipped(
  scope: DeletionConfirmationScope,
  skip: boolean,
): void {
  try {
    if (skip) localStorage.setItem(STORAGE_KEYS[scope], "true");
    else localStorage.removeItem(STORAGE_KEYS[scope]);
  } catch {
    // Local-storage failures must not block a destructive-action safeguard.
  }
}
