import { CloudRequestError } from "@freestyle-voice/utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "../src/lib/db.js";
import { clearSession, setSession } from "../src/lib/sessions.js";

// Mock only the cloud transport (network). isTransientCloudError is left real so
// the transient-vs-permanent classification is genuinely exercised.
const putCloudPreferences = vi.fn(async () => ({ syncedAt: "now" }));
const resolveActiveOrgSlug = vi.fn(async () => "acme" as string | null);

vi.mock("../src/lib/freestyle-cloud.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../src/lib/freestyle-cloud.js")>();
  return {
    ...actual,
    putCloudPreferences: (...args: unknown[]) => putCloudPreferences(...args),
    resolveActiveOrgSlug: (...args: unknown[]) => resolveActiveOrgSlug(...args),
  };
});

const { clearOutbox, enqueueOutbox, drainOutbox, outboxBackoffMs } =
  await import("../src/lib/sync-outbox.js");

interface Row {
  cloud_field: string;
  payload: string;
  attempts: number;
  next_attempt_at: string;
  last_error: string | null;
}

function rows(): Row[] {
  return getDb()
    .prepare("SELECT * FROM sync_outbox ORDER BY cloud_field")
    .all() as unknown as Row[];
}

function signIn(): void {
  setSession({
    token: "test-token",
    user: {
      id: "user_1",
      email: "user@example.com",
      name: "User",
      image: null,
    },
    host: "https://service.freestylevoice.com",
  });
}

/** Flush pending microtasks so a fire-and-forget drain settles (fake timers are
 * global in this suite, so setTimeout-based waits can't be used). */
async function settle(): Promise<void> {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

beforeEach(() => {
  getDb().exec("DELETE FROM sync_outbox");
  // Reset mock implementations each test (clearAllMocks clears call history but
  // not mockResolvedValue implementations, which would otherwise leak).
  putCloudPreferences.mockReset().mockResolvedValue({ syncedAt: "now" });
  resolveActiveOrgSlug.mockReset().mockResolvedValue("acme");
  signIn();
});

afterEach(async () => {
  // Let any fire-and-forget immediate drain (from enqueueOutbox) settle so its
  // module-level in-flight guard is released before the next test.
  await settle();
  getDb().exec("DELETE FROM sync_outbox");
  clearSession();
  vi.clearAllMocks();
});

describe("enqueueOutbox", () => {
  it("no-ops when signed out (no row written)", () => {
    clearSession();
    enqueueOutbox("languages", { languages: ["en"] });
    expect(rows()).toHaveLength(0);
  });

  it("collapses repeated edits of a field into a single newest-wins row", async () => {
    // No active org yet -> the immediate flush is a no-op that leaves the row
    // in place, so we can inspect the collapsed result.
    resolveActiveOrgSlug.mockResolvedValue(null);

    enqueueOutbox("languages", { languages: ["en"] });
    enqueueOutbox("languages", { languages: ["en", "es"] });
    enqueueOutbox("languages", { languages: ["fr"] });
    await settle();

    const all = rows();
    expect(all).toHaveLength(1);
    expect(all[0].cloud_field).toBe("languages");
    expect(JSON.parse(all[0].payload)).toEqual({ languages: ["fr"] });
    expect(putCloudPreferences).not.toHaveBeenCalled();
  });

  it("keeps separate rows per cloud field", async () => {
    resolveActiveOrgSlug.mockResolvedValue(null);
    enqueueOutbox("languages", { languages: ["en"] });
    enqueueOutbox("intensity", { intensity: "medium" });
    await settle();
    expect(rows().map((r) => r.cloud_field)).toEqual([
      "intensity",
      "languages",
    ]);
  });
});

describe("drainOutbox", () => {
  function insertDue(field: string, patch: object): void {
    getDb()
      .prepare(
        `INSERT INTO sync_outbox (cloud_field, payload, updated_at, next_attempt_at, attempts)
         VALUES (?, ?, datetime('now'), datetime('now'), 0)`,
      )
      .run(field, JSON.stringify(patch));
  }

  it("deletes a row after a successful PUT", async () => {
    insertDue("languages", { languages: ["en"] });
    await drainOutbox();

    expect(putCloudPreferences).toHaveBeenCalledTimes(1);
    const [, orgSlug, patch] = putCloudPreferences.mock.calls[0] as [
      string,
      string,
      object,
    ];
    expect(orgSlug).toBe("acme");
    expect(patch).toEqual({ languages: ["en"] });
    expect(rows()).toHaveLength(0);
  });

  it("keeps and backs off a row on a transient (5xx) error", async () => {
    putCloudPreferences.mockRejectedValueOnce(new CloudRequestError(503));
    insertDue("languages", { languages: ["en"] });

    await drainOutbox();

    const all = rows();
    expect(all).toHaveLength(1);
    expect(all[0].attempts).toBe(1);
    expect(all[0].last_error).toContain("503");
    // next_attempt_at was pushed into the future.
    const future = getDb()
      .prepare("SELECT next_attempt_at > datetime('now') AS f FROM sync_outbox")
      .get() as { f: number };
    expect(future.f).toBe(1);
  });

  it("keeps and backs off a row on a network error", async () => {
    const netErr = Object.assign(new Error("fetch failed"), {
      cause: { code: "ECONNREFUSED" },
    });
    putCloudPreferences.mockRejectedValueOnce(netErr);
    insertDue("languages", { languages: ["en"] });

    await drainOutbox();

    expect(rows()).toHaveLength(1);
    expect(rows()[0].attempts).toBe(1);
  });

  it("drops a row on a permanent (4xx) error", async () => {
    putCloudPreferences.mockRejectedValueOnce(
      new CloudRequestError(400, "bad"),
    );
    insertDue("languages", { languages: ["en"] });

    await drainOutbox();

    expect(rows()).toHaveLength(0);
  });

  it("drops a row with a corrupt payload rather than retrying forever", async () => {
    getDb()
      .prepare(
        `INSERT INTO sync_outbox (cloud_field, payload, next_attempt_at)
         VALUES ('languages', '{not json', datetime('now'))`,
      )
      .run();

    await drainOutbox();

    expect(putCloudPreferences).not.toHaveBeenCalled();
    expect(rows()).toHaveLength(0);
  });

  it("no-ops (never PUTs) when signed out", async () => {
    insertDue("languages", { languages: ["en"] });
    clearSession();

    await drainOutbox();

    expect(resolveActiveOrgSlug).not.toHaveBeenCalled();
    expect(putCloudPreferences).not.toHaveBeenCalled();
    expect(rows()).toHaveLength(1); // untouched
  });

  it("keeps rows when there is no active org yet", async () => {
    resolveActiveOrgSlug.mockResolvedValueOnce(null);
    insertDue("languages", { languages: ["en"] });

    await drainOutbox();

    expect(putCloudPreferences).not.toHaveBeenCalled();
    expect(rows()).toHaveLength(1);
  });

  it("skips rows whose backoff has not elapsed", async () => {
    getDb()
      .prepare(
        `INSERT INTO sync_outbox (cloud_field, payload, next_attempt_at)
         VALUES ('languages', '{}', datetime('now', '+1 hour'))`,
      )
      .run();

    await drainOutbox();

    expect(putCloudPreferences).not.toHaveBeenCalled();
    expect(rows()).toHaveLength(1);
  });

  it("stops draining after the first transient error (server is down)", async () => {
    putCloudPreferences.mockRejectedValue(new CloudRequestError(500));
    insertDue("intensity", { intensity: "low" });
    insertDue("languages", { languages: ["en"] });

    await drainOutbox();

    // Only the first due row is attempted; the rest are left for the next tick.
    expect(putCloudPreferences).toHaveBeenCalledTimes(1);
    expect(rows()).toHaveLength(2);
  });
});

describe("clearOutbox", () => {
  it("discards all pending rows (sign-out)", () => {
    getDb()
      .prepare(
        `INSERT INTO sync_outbox (cloud_field, payload, next_attempt_at)
         VALUES ('languages', '{}', datetime('now')),
                ('intensity', '{}', datetime('now'))`,
      )
      .run();
    expect(rows()).toHaveLength(2);

    clearOutbox();

    expect(rows()).toHaveLength(0);
  });
});

describe("outboxBackoffMs", () => {
  it("starts at 1 min and doubles", () => {
    expect(outboxBackoffMs(1)).toBe(60_000);
    expect(outboxBackoffMs(2)).toBe(120_000);
    expect(outboxBackoffMs(3)).toBe(240_000);
  });

  it("caps at 1 hour", () => {
    expect(outboxBackoffMs(20)).toBe(3_600_000);
  });
});
