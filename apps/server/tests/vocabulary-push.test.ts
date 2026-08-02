import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "../src/lib/db.js";
import { clearSession, setSession } from "../src/lib/sessions.js";

// Mock the cloud transport so no real network call is made; capture the PUT
// payloads to assert on what gets pushed.
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

// Imported after the mock is registered.
const { pushVocabularyToCloud } = await import(
  "../src/lib/preferences-sync.js"
);

function reset(): void {
  getDb().exec("DELETE FROM vocabulary");
}

function insertLocal(term: string): void {
  getDb().prepare("INSERT INTO vocabulary (term) VALUES (?)").run(term);
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

/** Let the debounced timer fire and its async flush settle. */
async function flush(): Promise<void> {
  await vi.runAllTimersAsync();
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  reset();
  clearSession();
  vi.clearAllMocks();
});

describe("pushVocabularyToCloud", () => {
  it("no-ops when signed out (never resolves an org or pushes)", async () => {
    insertLocal("Freestyle");
    pushVocabularyToCloud();
    await flush();
    expect(resolveActiveOrgSlug).not.toHaveBeenCalled();
    expect(putCloudPreferences).not.toHaveBeenCalled();
  });

  it("pushes the full local term list as a replace payload", async () => {
    signIn();
    insertLocal("Freestyle");
    insertLocal("Kubernetes");

    pushVocabularyToCloud();
    await flush();

    expect(putCloudPreferences).toHaveBeenCalledTimes(1);
    const [, orgSlug, patch] = putCloudPreferences.mock.calls[0] as [
      string,
      string,
      { vocabulary: { terms: string[] } },
    ];
    expect(orgSlug).toBe("acme");
    expect(patch.vocabulary.terms.sort()).toEqual(["Freestyle", "Kubernetes"]);
  });

  it("coalesces a burst of edits into a single PUT with the latest snapshot", async () => {
    signIn();
    insertLocal("First");
    pushVocabularyToCloud();

    // More edits arrive before the debounce window elapses.
    insertLocal("Second");
    pushVocabularyToCloud();
    insertLocal("Third");
    pushVocabularyToCloud();

    await flush();

    // Only one request, carrying the final full list.
    expect(putCloudPreferences).toHaveBeenCalledTimes(1);
    const patch = putCloudPreferences.mock.calls[0][2] as {
      vocabulary: { terms: string[] };
    };
    expect(patch.vocabulary.terms.sort()).toEqual(["First", "Second", "Third"]);
  });

  it("pushes an empty array when the last local term is deleted", async () => {
    signIn();
    // No local terms -> the payload is an explicit empty list so the cloud
    // clears its stored set (delete propagation).
    pushVocabularyToCloud();
    await flush();

    expect(putCloudPreferences).toHaveBeenCalledTimes(1);
    const patch = putCloudPreferences.mock.calls[0][2] as {
      vocabulary: { terms: string[] };
    };
    expect(patch.vocabulary.terms).toEqual([]);
  });

  it("swallows push errors (never throws)", async () => {
    signIn();
    insertLocal("Boom");
    putCloudPreferences.mockRejectedValueOnce(new Error("network down"));

    pushVocabularyToCloud();
    await expect(flush()).resolves.not.toThrow();
  });
});
