import type { MemberPreferencesInput } from "@freestyle-voice/validations";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb, readSetting, writeSetting } from "../src/lib/db.js";
import { clearSession, setSession } from "../src/lib/sessions.js";

// Mock the cloud transport. `getCloudPreferences` feeds the pull the snapshot we
// diff against; `putCloudPreferences` is made to HANG so the outbox drain never
// deletes a delivered row — that keeps the enqueued backfill patches in the
// `sync_outbox` table for deterministic assertions.
const getCloudPreferences = vi.fn<[], Promise<MemberPreferencesInput>>();
const resolveActiveOrgSlug = vi.fn(async () => "acme");
const putCloudPreferences = vi.fn(
  () => new Promise<{ syncedAt?: string }>(() => {}),
);

vi.mock("../src/lib/freestyle-cloud.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../src/lib/freestyle-cloud.js")>();
  return {
    ...actual,
    getCloudPreferences: (...args: unknown[]) => getCloudPreferences(...args),
    resolveActiveOrgSlug: (...args: unknown[]) => resolveActiveOrgSlug(...args),
    putCloudPreferences: (...args: unknown[]) => putCloudPreferences(...args),
  };
});

const {
  pullCloudPreferences,
  resetPreferencesBackfill,
  resetSyncedPreferencesForAccount,
} = await import("../src/lib/preferences-sync.js");

const BACKFILLED_KEY = "cloud_prefs_backfilled";
const SYNCED_ACCOUNT_KEY = "cloud_synced_account_id";

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

function insertVocab(term: string): void {
  getDb().prepare("INSERT INTO vocabulary (term) VALUES (?)").run(term);
}

/** Read the pending backfill patches keyed by cloud field. */
function outboxByField(): Record<string, MemberPreferencesInput> {
  const rows = getDb()
    .prepare("SELECT cloud_field, payload FROM sync_outbox")
    .all() as { cloud_field: string; payload: string }[];
  const out: Record<string, MemberPreferencesInput> = {};
  for (const r of rows) out[r.cloud_field] = JSON.parse(r.payload);
  return out;
}

function reset(): void {
  const db = getDb();
  db.exec("DELETE FROM settings");
  db.exec("DELETE FROM vocabulary");
  db.exec("DELETE FROM sync_outbox");
}

beforeEach(() => {
  signIn();
  getCloudPreferences.mockResolvedValue({});
});

afterEach(() => {
  reset();
  clearSession();
  vi.clearAllMocks();
});

describe("one-time cloud preference backfill", () => {
  it("seeds fields the cloud is missing but that are set locally", async () => {
    // Cloud snapshot has nothing; local has intensity, languages, and vocab.
    getCloudPreferences.mockResolvedValue({});
    writeSetting("cleanup_intensity", "high");
    writeSetting("languages", JSON.stringify(["en", "hi"]));
    insertVocab("Kubernetes");
    insertVocab("Freestyle");

    await pullCloudPreferences();

    const outbox = outboxByField();
    expect(outbox.intensity).toEqual({ intensity: "high" });
    expect(outbox.languages).toEqual({ languages: ["en", "hi"] });
    expect(outbox.vocabulary?.vocabulary?.terms?.sort()).toEqual([
      "Freestyle",
      "Kubernetes",
    ]);
    // Flag is set so we don't diff again on the next launch.
    expect(readSetting(BACKFILLED_KEY)).toBe("1");
  });

  it("does not overwrite a field the cloud already has (cloud wins)", async () => {
    // Cloud already carries intensity; local differs. The pull applies the
    // cloud value to local and the backfill must NOT push anything for it.
    getCloudPreferences.mockResolvedValue({ intensity: "high" });
    writeSetting("cleanup_intensity", "low");

    await pullCloudPreferences();

    expect(readSetting("cleanup_intensity")).toBe("high");
    expect(outboxByField().intensity).toBeUndefined();
  });

  it("skips empty JSON arrays (an empty selection seeds nothing)", async () => {
    getCloudPreferences.mockResolvedValue({});
    writeSetting("languages", JSON.stringify([]));

    await pullCloudPreferences();

    expect(outboxByField().languages).toBeUndefined();
  });

  it("does not push vocabulary the cloud already carries", async () => {
    getCloudPreferences.mockResolvedValue({ vocabulary: { terms: ["Cloud"] } });
    insertVocab("Local");

    await pullCloudPreferences();

    expect(outboxByField().vocabulary).toBeUndefined();
  });

  it("runs once per account, then re-arms on sign-out", async () => {
    getCloudPreferences.mockResolvedValue({});
    writeSetting("cleanup_intensity", "high");

    await pullCloudPreferences();
    expect(outboxByField().intensity).toEqual({ intensity: "high" });

    // A second pull must NOT re-enqueue (flag guards it).
    getDb().exec("DELETE FROM sync_outbox");
    await pullCloudPreferences();
    expect(outboxByField().intensity).toBeUndefined();

    // Sign-out re-arms the backfill for the next account.
    resetPreferencesBackfill();
    await pullCloudPreferences();
    expect(outboxByField().intensity).toEqual({ intensity: "high" });
  });

  it("no-ops when signed out", async () => {
    clearSession();
    writeSetting("cleanup_intensity", "high");

    await pullCloudPreferences();

    expect(getCloudPreferences).not.toHaveBeenCalled();
    expect(outboxByField()).toEqual({});
    expect(readSetting(BACKFILLED_KEY)).toBeUndefined();
  });
});

describe("account-change scrub", () => {
  function seedLocalPrefs(): void {
    writeSetting("cleanup_intensity", "high");
    writeSetting("languages", JSON.stringify(["en", "hi"]));
    insertVocab("Kubernetes");
    // Pretend the backfill already ran for the prior account.
    writeSetting(BACKFILLED_KEY, "1");
  }

  function localVocabCount(): number {
    const row = getDb()
      .prepare("SELECT COUNT(*) AS n FROM vocabulary")
      .get() as { n: number };
    return row.n;
  }

  it("clears the prior account's synced prefs + vocabulary when a different account signs in", () => {
    seedLocalPrefs();
    resetSyncedPreferencesForAccount("user_1");

    // A different account takes over the device.
    resetSyncedPreferencesForAccount("user_2");

    expect(readSetting("cleanup_intensity")).toBeUndefined();
    expect(readSetting("languages")).toBeUndefined();
    expect(localVocabCount()).toBe(0);
    // Backfill is re-armed so it re-evaluates against the clean local state.
    expect(readSetting(BACKFILLED_KEY)).toBe("");
    expect(readSetting(SYNCED_ACCOUNT_KEY)).toBe("user_2");
  });

  it("keeps local state when the same account signs in again", () => {
    seedLocalPrefs();
    resetSyncedPreferencesForAccount("user_1");

    resetSyncedPreferencesForAccount("user_1");

    expect(readSetting("cleanup_intensity")).toBe("high");
    expect(localVocabCount()).toBe(1);
    // Untouched — the same account's backfill flag is preserved.
    expect(readSetting(BACKFILLED_KEY)).toBe("1");
  });

  it("keeps pre-sign-in local prefs on a first-ever sign-in (no prior owner)", () => {
    seedLocalPrefs();
    // No CLOUD_SYNCED_ACCOUNT_KEY set yet — first account to sync on this device.
    getDb().prepare("DELETE FROM settings WHERE key = ?").run(BACKFILLED_KEY);

    resetSyncedPreferencesForAccount("user_1");

    // Local prefs survive so they can seed the new account's cloud.
    expect(readSetting("cleanup_intensity")).toBe("high");
    expect(localVocabCount()).toBe(1);
    expect(readSetting(SYNCED_ACCOUNT_KEY)).toBe("user_1");
  });
});
