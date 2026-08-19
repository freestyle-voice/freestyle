import { describe, expect, it } from "vitest";
import { getDb } from "../src/lib/db.js";
import {
  getNotification,
  listActive,
  markSeen,
  upsertFromCloud,
} from "../src/lib/notifications/store.js";

const cloud = (id: string, createdAt: number, body: string) => ({
  id,
  kind: "thread" as const,
  title: "Open PRs",
  body,
  payload: { threadId: `thread-${createdAt}` },
  createdAt,
  expiresAt: createdAt + 60_000,
});

describe("upsertFromCloud", () => {
  it("re-pops a notification the cloud re-posted after it was seen and dismissed here", () => {
    const id = `cloud-${Date.now()}`;
    const first = Date.now();
    upsertFromCloud([cloud(id, first, "v1")], "user-1");
    markSeen([id]);
    getDb()
      .prepare("UPDATE notifications SET dismissed_at = ? WHERE id = ?")
      .run(first + 1, id);
    expect(listActive().some((n) => n.id === id)).toBe(false);

    upsertFromCloud([cloud(id, first + 5_000, "v2")], "user-1");

    const record = getNotification(id);
    expect(record).toMatchObject({
      body: "v2",
      seenAt: null,
      createdAt: first + 5_000,
    });
    expect(listActive().some((n) => n.id === id)).toBe(true);
  });

  it("keeps the seen marker when the cloud row is unchanged", () => {
    const id = `cloud-same-${Date.now()}`;
    const createdAt = Date.now();
    upsertFromCloud([cloud(id, createdAt, "v1")], "user-1");
    markSeen([id]);
    upsertFromCloud([cloud(id, createdAt, "v1")], "user-1");
    expect(getNotification(id)?.seenAt).not.toBeNull();
  });
});
