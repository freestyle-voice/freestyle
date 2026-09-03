export type SyncEvent = { resource: string; entityId?: string };

const listeners = new Set<(event: SyncEvent) => void>();

export function emitSyncEvent(event: SyncEvent): void {
  for (const listener of listeners) listener(event);
}

export function subscribeSyncEvents(
  listener: (event: SyncEvent) => void,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
