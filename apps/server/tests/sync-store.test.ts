import { describe, expect, it } from "vitest";
import { getDb } from "../src/lib/db.js";
import { LocalSyncStore } from "../src/lib/sync-store.js";

describe("LocalSyncStore", () => {
  it("keeps cached records and pending operations isolated by account scope", () => {
    const store = new LocalSyncStore(getDb());
    store.writeCached({
      scope: "cloud:user-a:org-a",
      resource: "brain-file",
      id: "notes/a.md",
      value: { text: "A" },
      revision: 1,
    });
    store.enqueue({
      scope: "cloud:user-a:org-a",
      resource: "brain-file",
      entityId: "notes/a.md",
      kind: "write",
      payload: { text: "A" },
      expectedRevision: 1,
    });

    expect(
      store.readCached("cloud:user-a:org-a", "brain-file", "notes/a.md")?.value,
    ).toEqual({ text: "A" });
    expect(
      store.readCached("cloud:user-b:org-b", "brain-file", "notes/a.md"),
    ).toBeNull();
    expect(store.getStatus("cloud:user-b:org-b").pending).toBe(0);
  });

  it("keeps a newly queued operation behind one that is already syncing", () => {
    const store = new LocalSyncStore(getDb());
    const scope = "cloud:queue-user:queue-org";
    const firstOperation = store.enqueue({
      scope,
      resource: "brain-file",
      entityId: "notes/ordered.md",
      kind: "write",
      payload: { text: "first" },
      expectedRevision: 1,
    });
    getDb()
      .prepare(
        "UPDATE sync_operations SET state = 'syncing' WHERE operation_id = ?",
      )
      .run(firstOperation);

    store.enqueue({
      scope,
      resource: "brain-file",
      entityId: "notes/ordered.md",
      kind: "delete",
      payload: { path: "notes/ordered.md" },
      expectedRevision: 1,
    });

    const operations = getDb()
      .prepare(
        "SELECT kind, state FROM sync_operations WHERE scope = ? ORDER BY created_at, rowid",
      )
      .all(scope);
    expect(operations).toEqual([
      { kind: "write", state: "syncing" },
      { kind: "delete", state: "pending" },
    ]);
  });

  it("requeues an operation that was syncing when the server stopped", () => {
    const store = new LocalSyncStore(getDb());
    const scope = "cloud:recovery-user:recovery-org";
    const operationId = store.enqueue({
      scope,
      resource: "brain-file",
      entityId: "notes/recovery.md",
      kind: "write",
      payload: { text: "recover me" },
    });
    getDb()
      .prepare(
        "UPDATE sync_operations SET state = 'syncing' WHERE operation_id = ?",
      )
      .run(operationId);

    expect(
      (
        store as unknown as {
          recoverSyncingOperations: (scope: string, resource: string) => void;
        }
      ).recoverSyncingOperations(scope, "brain-file"),
    ).toBeUndefined();
    expect(store.claimDueOperations(scope, "brain-file")).toMatchObject([
      { operationId, entityId: "notes/recovery.md", kind: "write" },
    ]);
  });

  it("applies local Brain writes and deletions to the cached file list", () => {
    const store = new LocalSyncStore(getDb());
    const scope = "cloud:list-user:list-org";
    store.writeCached({
      scope,
      resource: "brain-list",
      id: "all",
      value: {
        ok: true,
        files: [{ path: "notes/remote.md", size: 6, modified: 1 }],
      },
    });
    store.writeAndEnqueue({
      scope,
      resource: "brain-file",
      entityId: "notes/local.md",
      kind: "write",
      value: { ok: true, text: "local" },
    });
    store.applyBrainListMutation({
      scope,
      kind: "write",
      path: "notes/local.md",
      text: "local",
    });
    store.deleteAndEnqueue({
      scope,
      resource: "brain-file",
      entityId: "notes/remote.md",
    });
    store.applyBrainListMutation({
      scope,
      kind: "delete",
      path: "notes/remote.md",
    });
    // A read cache entry is not a local mutation and must never make a file
    // reappear after Cloud removed it from the authoritative list.
    store.writeCached({
      scope,
      resource: "brain-file",
      id: "notes/stale-read.md",
      value: { ok: true, text: "stale" },
    });

    expect(store.readCached(scope, "brain-list", "all")?.value).toMatchObject({
      ok: true,
      files: [
        {
          path: "notes/local.md",
          size: 5,
        },
      ],
    });
  });
});
