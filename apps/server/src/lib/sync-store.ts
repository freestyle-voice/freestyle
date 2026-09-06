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

type BrainListFile = { path: string; size: number; modified: number };

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
    // An operation being sent must remain the head of its entity's queue. Only
    // a tail that has not left this process is safe to coalesce.
    this.db
      .prepare(
        `DELETE FROM sync_operations
         WHERE scope = ? AND resource = ? AND entity_id = ?
           AND state IN ('pending', 'failed')`,
      )
      .run(input.scope, input.resource, input.entityId);
    const nextSequence = this.db
      .prepare(
        `SELECT COALESCE(MAX(sequence), 0) + 1 AS sequence
         FROM sync_operations
         WHERE scope = ? AND resource = ? AND entity_id = ?`,
      )
      .get(input.scope, input.resource, input.entityId) as { sequence: number };
    this.db
      .prepare(
        `INSERT INTO sync_operations (operation_id, scope, resource, entity_id, kind, payload, expected_revision, sequence, state, next_attempt_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', datetime('now'), datetime('now'), datetime('now'))`,
      )
      .run(
        operationId,
        input.scope,
        input.resource,
        input.entityId,
        input.kind,
        JSON.stringify(input.payload),
        input.expectedRevision ?? null,
        nextSequence.sequence,
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
      // Keep a tombstone even when the body was never cached. List projection
      // needs it to hide a remote file immediately after a local deletion.
      this.db
        .prepare(
          `INSERT INTO sync_entities (scope, resource, entity_id, payload, fetched_at, updated_at, deleted_at)
           VALUES (?, ?, ?, '{}', datetime('now'), datetime('now'), datetime('now'))
           ON CONFLICT(scope, resource, entity_id) DO UPDATE SET
             deleted_at = datetime('now'), updated_at = datetime('now')`,
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

  /**
   * Atomically claims at most one due operation per entity. A successor never
   * leaves the durable queue until its predecessor has completed or been
   * explicitly superseded by a new user action.
   */
  claimDueOperations(scope: string, resource?: string): PendingSyncOperation[] {
    const resourceClause = resource ? " AND o.resource = ?" : "";
    const params = resource ? [scope, resource] : [scope];
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const rows = this.db
        .prepare(
          `SELECT o.operation_id, o.resource, o.entity_id, o.kind, o.payload, o.expected_revision, o.attempts
           FROM sync_operations o
           WHERE o.scope = ? AND o.state = 'pending'
             AND o.next_attempt_at <= datetime('now')${resourceClause}
             AND NOT EXISTS (
               SELECT 1 FROM sync_operations predecessor
               WHERE predecessor.scope = o.scope
                 AND predecessor.resource = o.resource
                 AND predecessor.entity_id = o.entity_id
                 AND predecessor.sequence < o.sequence
                 AND predecessor.state IN ('pending', 'syncing', 'failed')
             )
           ORDER BY o.created_at ASC, o.sequence ASC, o.rowid ASC`,
        )
        .all(...params) as Array<{
        operation_id: string;
        resource: string;
        entity_id: string;
        kind: "write" | "delete";
        payload: string;
        expected_revision: number | null;
        attempts: number;
      }>;
      const claim = this.db.prepare(
        `UPDATE sync_operations
         SET state = 'syncing', updated_at = datetime('now')
         WHERE operation_id = ? AND state = 'pending'`,
      );
      const claimed = rows.filter(
        (row) => claim.run(row.operation_id).changes === 1,
      );
      this.db.exec("COMMIT");
      return claimed.map((row) => ({
        operationId: row.operation_id,
        resource: row.resource,
        entityId: row.entity_id,
        kind: row.kind,
        payload: JSON.parse(row.payload),
        expectedRevision: row.expected_revision,
        attempts: row.attempts,
      }));
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  /** Reclaims work that was in flight when a previous server process exited. */
  recoverSyncingOperations(scope: string, resource: string): void {
    this.db
      .prepare(
        `UPDATE sync_operations
         SET state = 'pending', next_attempt_at = datetime('now'),
             last_error = 'server-restarted', updated_at = datetime('now')
         WHERE scope = ? AND resource = ? AND state = 'syncing'`,
      )
      .run(scope, resource);
  }

  completeOperation(operationId: string, revision?: number): void {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const operation = this.db
        .prepare(
          `SELECT scope, resource, entity_id FROM sync_operations
           WHERE operation_id = ? AND state = 'syncing'`,
        )
        .get(operationId) as
        | { scope: string; resource: string; entity_id: string }
        | undefined;
      if (!operation) {
        this.db.exec("COMMIT");
        return;
      }
      this.db
        .prepare("DELETE FROM sync_operations WHERE operation_id = ?")
        .run(operationId);
      if (typeof revision === "number") {
        this.db
          .prepare(
            `UPDATE sync_entities SET revision = ?, updated_at = datetime('now')
             WHERE scope = ? AND resource = ? AND entity_id = ?`,
          )
          .run(
            revision,
            operation.scope,
            operation.resource,
            operation.entity_id,
          );
        this.db
          .prepare(
            `UPDATE sync_operations SET expected_revision = ?, updated_at = datetime('now')
             WHERE operation_id = (
               SELECT operation_id FROM sync_operations
               WHERE scope = ? AND resource = ? AND entity_id = ? AND state = 'pending'
               ORDER BY sequence ASC LIMIT 1
             )`,
          )
          .run(
            revision,
            operation.scope,
            operation.resource,
            operation.entity_id,
          );
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  hasQueuedSuccessor(operationId: string): boolean {
    const row = this.db
      .prepare(
        `SELECT EXISTS (
           SELECT 1 FROM sync_operations successor
           JOIN sync_operations operation
             ON operation.scope = successor.scope
            AND operation.resource = successor.resource
            AND operation.entity_id = successor.entity_id
           WHERE operation.operation_id = ?
             AND successor.sequence > operation.sequence
             AND successor.state IN ('pending', 'syncing')
         ) AS exists`,
      )
      .get(operationId) as { exists: number };
    return row.exists === 1;
  }

  updateCachedRevision(input: {
    scope: string;
    resource: string;
    id: string;
    revision: number;
  }): void {
    this.db
      .prepare(
        `UPDATE sync_entities SET revision = ?, updated_at = datetime('now')
         WHERE scope = ? AND resource = ? AND entity_id = ?`,
      )
      .run(input.revision, input.scope, input.resource, input.id);
  }

  deferOperation(
    operationId: string,
    attempts: number,
    delayMs: number,
    error: string,
  ): void {
    this.db
      .prepare(
        `UPDATE sync_operations SET attempts = ?, state = 'pending', next_attempt_at = datetime('now', ?), last_error = ?, updated_at = datetime('now') WHERE operation_id = ? AND state = 'syncing'`,
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
        "UPDATE sync_operations SET state = 'failed', last_error = ?, updated_at = datetime('now') WHERE operation_id = ? AND state = 'syncing'",
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

  clearBrain(scope: string): void {
    this.db.exec("BEGIN");
    try {
      this.db
        .prepare(
          "DELETE FROM sync_entities WHERE scope = ? AND resource IN ('brain-file', 'brain-list', 'brain-graph')",
        )
        .run(scope);
      this.db
        .prepare(
          "DELETE FROM sync_resource_state WHERE scope = ? AND resource IN ('brain-file', 'brain-list', 'brain-graph')",
        )
        .run(scope);
      this.db
        .prepare(
          "DELETE FROM sync_operations WHERE scope = ? AND resource IN ('brain-file', 'brain-list', 'brain-graph')",
        )
        .run(scope);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  getBrainStatus(scope: string): { pending: number; failed: number } {
    const row = this.db
      .prepare(
        `SELECT SUM(state IN ('pending', 'syncing')) AS pending,
                SUM(state = 'failed') AS failed
         FROM sync_operations
         WHERE scope = ? AND resource = 'brain-file'`,
      )
      .get(scope) as { pending: number | null; failed: number | null };
    return { pending: row.pending ?? 0, failed: row.failed ?? 0 };
  }

  applyBrainListMutation(input: {
    scope: string;
    kind: "write" | "delete";
    path: string;
    text?: string;
  }): void {
    const cached = this.readCached(input.scope, "brain-list", "all");
    if (!cached || typeof cached.value !== "object" || cached.value === null) {
      return;
    }
    const payload = cached.value as Record<string, unknown>;
    const files = new Map<string, BrainListFile>();
    const remoteFiles = payload.files;
    if (Array.isArray(remoteFiles)) {
      for (const file of remoteFiles) {
        if (
          typeof file === "object" &&
          file !== null &&
          typeof (file as { path?: unknown }).path === "string"
        ) {
          const candidate = file as Partial<BrainListFile>;
          files.set(candidate.path as string, {
            path: candidate.path as string,
            size: typeof candidate.size === "number" ? candidate.size : 0,
            modified:
              typeof candidate.modified === "number"
                ? candidate.modified
                : Date.now(),
          });
        }
      }
    }
    if (input.kind === "delete") {
      files.delete(input.path);
    } else if (typeof input.text === "string") {
      const existing = files.get(input.path);
      files.set(input.path, {
        path: input.path,
        size: input.text.length,
        modified: existing?.modified ?? Date.now(),
      });
    }
    this.writeCached({
      scope: input.scope,
      resource: "brain-list",
      id: "all",
      value: { ...payload, ok: true, files: [...files.values()] },
      revision: cached.revision,
    });
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
