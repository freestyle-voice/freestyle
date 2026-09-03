import { getDb } from "./db.js";
import { emitSyncEvent } from "./sync-events.js";
import { cachedSyncScope, resolveSyncScope } from "./sync-scope.js";
import { LocalSyncStore } from "./sync-store.js";

/**
 * Caches a Cloud JSON read in the current account/org namespace.  It is kept
 * at the local-server boundary so renderers neither see the Cloud bearer nor
 * know about SQLite.
 */
export async function cachedCloudJson<T>(input: {
  resource: string;
  id: string;
  maxAgeMs: number;
  load: () => Promise<T>;
}): Promise<T> {
  const scope = cachedSyncScope() ?? (await resolveSyncScope());
  return readThroughCloudCache({
    store: new LocalSyncStore(getDb()),
    scope,
    resource: input.resource,
    id: input.id,
    maxAgeMs: input.maxAgeMs,
    load: input.load,
  });
}

export async function readThroughCloudCache<T>(input: {
  store: LocalSyncStore;
  scope: string | null;
  resource: string;
  id: string;
  maxAgeMs: number;
  load: () => Promise<T>;
}): Promise<T> {
  const cached = input.scope
    ? input.store.readCached(input.scope, input.resource, input.id)
    : null;
  const isFresh =
    cached !== null &&
    Date.now() - Date.parse(cached.fetchedAt) < input.maxAgeMs;
  if (cached !== null && isFresh) return cached.value as T;
  if (cached !== null) {
    void refresh(input);
    return cached.value as T;
  }
  const value = await input.load();
  if (input.scope) {
    input.store.writeCached({
      scope: input.scope,
      resource: input.resource,
      id: input.id,
      value,
    });
    input.store.markRefreshed(input.scope, input.resource);
  }
  return value;
}

async function refresh<T>(input: {
  store: LocalSyncStore;
  scope: string | null;
  resource: string;
  id: string;
  load: () => Promise<T>;
}): Promise<void> {
  if (!input.scope) return;
  try {
    const value = await input.load();
    input.store.writeCached({
      scope: input.scope,
      resource: input.resource,
      id: input.id,
      value,
    });
    input.store.markRefreshed(input.scope, input.resource);
    emitSyncEvent({ resource: input.resource, entityId: input.id });
  } catch (error) {
    input.store.markRefreshed(
      input.scope,
      input.resource,
      error instanceof Error ? error.message : String(error),
    );
  }
}
