export type SyncOperationKind = "write" | "delete";

export interface SyncScope {
  userId: string;
  organizationId: string | null;
}

export function syncScopeKey(scope: SyncScope): string {
  return `cloud:${scope.userId}:${scope.organizationId ?? "personal"}`;
}

export function syncBackoffMs(attempts: number): number {
  return Math.min(60_000 * 2 ** Math.max(0, attempts - 1), 3_600_000);
}
