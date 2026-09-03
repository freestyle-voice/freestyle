import type { DatabaseSync } from "node:sqlite";

export type CachedRecord = {
  value: unknown;
  revision: number | null;
  fetchedAt: string;
};
export type PendingSyncOperation = {
  operationId: string;
  resource: string;
  entityId: string;
  kind: "write" | "delete";
  payload: unknown;
  expectedRevision: number | null;
  attempts: number;
};

const BODY_RESOURCES = new Set(["brain-file", "thread-snapshot"]);
const BODY_CACHE_LIMIT_BYTES = 100 * 1024 * 1024;

export class LocalSyncStore {
  constructor(private readonly db: DatabaseSync) {}

  writeCached(input: {
    scope: string;
    resource: string;
    id: string;
    value: unknown;
    revision?: number | null;
  }): void {
    this.db
      .prepare(
        `INSERT INTO sync_entities (scope, resource, entity_id, payload, revision, fetched_at, updated_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
       ON CONFLICT(scope, resource, entity_id) DO UPDATE SET payload = excluded.payload, revision = excluded.revision, fetched_at = excluded.fetched_at, updated_at = excluded.updated_at, deleted_at = NULL`,
      )
      .run(
        input.scope,
        input.resource,
        input.id,
        JSON.stringify(input.value),
        input.revision ?? null,
      );
    if (BODY_RESOURCES.has(input.resource)) this.evictBodies();
  }

  readCached(scope: string, resource: string, id: string): CachedRecord | null {
    const row = this.db
      .prepare(
        "SELECT payload, revision, fetched_at FROM sync_entities WHERE scope = ? AND resource = ? AND entity_id = ? AND deleted_at IS NULL",
      )
      .get(scope, resource, id) as
      | { payload: string; revision: number | null; fetched_at: string }
      | undefined;
    return row
      ? {
          value: JSON.parse(row.payload),
          revision: row.revision,
          fetchedAt: row.fetched_at,
        }
      : null;
  }

  enqueue(input: {
    scope: string;
    resource: string;
    entityId: string;
    kind: "write" | "delete";
    payload: unknown;
    expectedRevision?: number | null;
  }): string {
    const operationId = crypto.randomUUID();
    this.db
      .prepare(
        `INSERT INTO sync_operations (operation_id, scope, resource, entity_id, kind, payload, expected_revision, state, next_attempt_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', datetime('now'), datetime('now'), datetime('now'))
       ON CONFLICT(scope, resource, entity_id) DO UPDATE SET
         operation_id = excluded.operation_id,
         kind = excluded.kind,
         payload = excluded.payload,
         expected_revision = excluded.expected_revision,
         state = 'pending',
         attempts = 0,
         next_attempt_at = datetime('now'),
         last_error = NULL,
         updated_at = datetime('now')`,
      )
      .run(
        operationId,
        input.scope,
        input.resource,
        input.entityId,
        input.kind,
        JSON.stringify(input.payload),
        input.expectedRevision ?? null,
      );
    return operationId;
  }

  /** Atomically changes the local replica and durable operation queue. */
  writeAndEnqueue(input: {
    scope: string;
    resource: string;
    entityId: string;
    kind: "write" | "delete";
    value: unknown;
    expectedRevision?: number | null;
  }): string {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.writeCached({
        scope: input.scope,
        resource: input.resource,
        id: input.entityId,
        value: input.value,
        revision: input.expectedRevision,
      });
      const operationId = this.enqueue({
        scope: input.scope,
        resource: input.resource,
        entityId: input.entityId,
        kind: input.kind,
        payload: input.value,
        expectedRevision: input.expectedRevision,
      });
      this.db.exec("COMMIT");
      return operationId;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  /** Atomically hides a locally cached entity and queues its remote deletion. */
  deleteAndEnqueue(input: {
    scope: string;
    resource: string;
    entityId: string;
    expectedRevision?: number | null;
  }): string {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db
        .prepare(
          `UPDATE sync_entities SET deleted_at = datetime('now'), updated_at = datetime('now')
         WHERE scope = ? AND resource = ? AND entity_id = ?`,
        )
        .run(input.scope, input.resource, input.entityId);
      const operationId = this.enqueue({
        scope: input.scope,
        resource: input.resource,
        entityId: input.entityId,
        kind: "delete",
        payload: { path: input.entityId },
        expectedRevision: input.expectedRevision,
      });
      this.db.exec("COMMIT");
      return operationId;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  dueOperations(scope: string): PendingSyncOperation[] {
    const rows = this.db
      .prepare(
        `SELECT operation_id, resource, entity_id, kind, payload, expected_revision, attempts
       FROM sync_operations
       WHERE scope = ? AND state = 'pending' AND next_attempt_at <= datetime('now')
       ORDER BY created_at ASC`,
      )
      .all(scope) as Array<{
      operation_id: string;
      resource: string;
      entity_id: string;
      kind: "write" | "delete";
      payload: string;
      expected_revision: number | null;
      attempts: number;
    }>;
    return rows.map((row) => ({
      operationId: row.operation_id,
      resource: row.resource,
      entityId: row.entity_id,
      kind: row.kind,
      payload: JSON.parse(row.payload),
      expectedRevision: row.expected_revision,
      attempts: row.attempts,
    }));
  }

  completeOperation(operationId: string): void {
    this.db
      .prepare("DELETE FROM sync_operations WHERE operation_id = ?")
      .run(operationId);
  }

  deferOperation(
    operationId: string,
    attempts: number,
    delayMs: number,
    error: string,
  ): void {
    this.db
      .prepare(
        `UPDATE sync_operations SET attempts = ?, state = 'pending', next_attempt_at = datetime('now', ?), last_error = ?, updated_at = datetime('now') WHERE operation_id = ?`,
      )
      .run(
        attempts,
        `+${Math.max(1, Math.round(delayMs / 1000))} seconds`,
        error,
        operationId,
      );
  }

  failOperation(operationId: string, error: string): void {
    this.db
      .prepare(
        "UPDATE sync_operations SET state = 'failed', last_error = ?, updated_at = datetime('now') WHERE operation_id = ?",
      )
      .run(error, operationId);
  }

  markRefreshed(scope: string, resource: string, error?: string): void {
    this.db
      .prepare(
        `INSERT INTO sync_resource_state (scope, resource, last_refresh_at, last_error)
       VALUES (?, ?, datetime('now'), ?)
       ON CONFLICT(scope, resource) DO UPDATE SET last_refresh_at = excluded.last_refresh_at, last_error = excluded.last_error`,
      )
      .run(scope, resource, error ?? null);
  }

  getStatus(scope: string): { pending: number; failed: number } {
    const row = this.db
      .prepare(
        "SELECT SUM(state IN ('pending', 'syncing')) AS pending, SUM(state = 'failed') AS failed FROM sync_operations WHERE scope = ?",
      )
      .get(scope) as { pending: number | null; failed: number | null };
    return { pending: row.pending ?? 0, failed: row.failed ?? 0 };
  }

  clearScope(scope: string): void {
    this.db.exec("BEGIN");
    try {
      this.db.prepare("DELETE FROM sync_entities WHERE scope = ?").run(scope);
      this.db
        .prepare("DELETE FROM sync_resource_state WHERE scope = ?")
        .run(scope);
      this.db.prepare("DELETE FROM sync_operations WHERE scope = ?").run(scope);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  private evictBodies(): void {
    const total = this.db
      .prepare(
        `SELECT COALESCE(SUM(length(payload)), 0) AS bytes FROM sync_entities
       WHERE resource IN ('brain-file', 'thread-snapshot') AND deleted_at IS NULL`,
      )
      .get() as { bytes: number };
    let excess = total.bytes - BODY_CACHE_LIMIT_BYTES;
    if (excess <= 0) return;
    const rows = this.db
      .prepare(
        `SELECT scope, resource, entity_id, length(payload) AS bytes FROM sync_entities
       WHERE resource IN ('brain-file', 'thread-snapshot') AND deleted_at IS NULL
       ORDER BY updated_at ASC`,
      )
      .all() as Array<{
      scope: string;
      resource: string;
      entity_id: string;
      bytes: number;
    }>;
    for (const row of rows) {
      this.db
        .prepare(
          "DELETE FROM sync_entities WHERE scope = ? AND resource = ? AND entity_id = ?",
        )
        .run(row.scope, row.resource, row.entity_id);
      excess -= row.bytes;
      if (excess <= 0) return;
    }
  }
}
