import { afterEach, describe, expect, it, vi } from "vitest";
import createApp from "../src/index.js";
import { getDb } from "../src/lib/db.js";

// Mirror the push machinery so we can assert a single cloud push per batch
// without hitting the network. The route calls pushVocabularyToCloud(), which
// debounces then flushes through the cloud transport.
const putCloudPreferences = vi.fn(async () => ({ syncedAt: "now" }));
const resolveActiveOrgSlug = vi.fn(async () => "acme");

vi.mock("../src/lib/freestyle-cloud.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../src/lib/freestyle-cloud.js")>();
  return {
    ...actual,
    putCloudPreferences: (...args: unknown[]) => putCloudPreferences(...args),
    resolveActiveOrgSlug: (...args: unknown[]) => resolveActiveOrgSlug(...args),
  };
});

const app = createApp();

function reset(): void {
  getDb().exec("DELETE FROM vocabulary");
}

function insert(term: string): number {
  const result = getDb()
    .prepare("INSERT INTO vocabulary (term) VALUES (?)")
    .run(term);
  return Number(result.lastInsertRowid);
}

function ids(): number[] {
  return (
    getDb().prepare("SELECT id FROM vocabulary ORDER BY id").all() as {
      id: number;
    }[]
  ).map((r) => r.id);
}

function post(body: unknown) {
  return app.request("/api/vocabulary/actions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

afterEach(() => {
  reset();
  vi.clearAllMocks();
});

describe("POST /api/vocabulary/actions", () => {
  describe("bulk-delete", () => {
    it("deletes the selected rows and leaves the rest", async () => {
      const a = insert("Alpha");
      const b = insert("Beta");
      insert("Gamma");

      const res = await post({ action: "bulk-delete", ids: [a, b] });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ deleted: 2 });

      const remaining = getDb()
        .prepare("SELECT term FROM vocabulary")
        .all() as { term: string }[];
      expect(remaining.map((r) => r.term)).toEqual(["Gamma"]);
    });

    it("counts only rows that actually existed and dedupes ids", async () => {
      const a = insert("Alpha");

      // `a` appears twice (dedupe) and 99999 doesn't exist (no-op).
      const res = await post({ action: "bulk-delete", ids: [a, a, 99999] });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ deleted: 1 });
      expect(ids()).toEqual([]);
    });

    it("rejects an empty id array with 400", async () => {
      const res = await post({ action: "bulk-delete", ids: [] });
      expect(res.status).toBe(400);
    });

    it("rejects non-positive / non-integer ids with 400", async () => {
      const res = await post({ action: "bulk-delete", ids: [0, -1, 1.5] });
      expect(res.status).toBe(400);
    });
  });

  describe("import", () => {
    it("inserts new terms and skips duplicates", async () => {
      insert("Existing");

      const res = await post({
        action: "import",
        entries: [{ term: "Existing" }, { term: "Fresh", notes: "n" }],
      });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ imported: 1, skipped: 1 });
    });
  });

  describe("export", () => {
    it("returns all terms sorted by term ascending", async () => {
      insert("Zeta");
      insert("Alpha");

      const res = await post({ action: "export", type: "json" });
      expect(res.status).toBe(200);
      const rows = (await res.json()) as { term: string }[];
      expect(rows.map((r) => r.term)).toEqual(["Alpha", "Zeta"]);
    });
  });

  it("rejects an unknown action with 400", async () => {
    const res = await post({ action: "nope", ids: [1] });
    expect(res.status).toBe(400);
  });
});
