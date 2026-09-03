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
});
