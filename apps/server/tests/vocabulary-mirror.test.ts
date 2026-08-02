import { afterEach, describe, expect, it } from "vitest";
import { getDb } from "../src/lib/db.js";
import {
  loadVocabularyTerms,
  mirrorCloudVocabularyTerms,
} from "../src/lib/vocabulary.js";

function reset(): void {
  getDb().exec("DELETE FROM vocabulary");
}

function insertLocal(term: string, notes: string | null = null): void {
  getDb()
    .prepare("INSERT INTO vocabulary (term, notes) VALUES (?, ?)")
    .run(term, notes);
}

afterEach(reset);

describe("mirrorCloudVocabularyTerms", () => {
  it("inserts terms into an empty table", () => {
    const changed = mirrorCloudVocabularyTerms(["Freestyle", "Kubernetes"]);
    expect(changed).toBe(2);
    expect(loadVocabularyTerms().sort()).toEqual(["Freestyle", "Kubernetes"]);
  });

  it("deletes local terms the cloud no longer has (authoritative mirror)", () => {
    insertLocal("StaleTerm");
    insertLocal("KeepTerm");

    // Cloud only has KeepTerm -> StaleTerm must be removed.
    const changed = mirrorCloudVocabularyTerms(["KeepTerm"]);
    expect(changed).toBe(1); // one deletion
    expect(loadVocabularyTerms()).toEqual(["KeepTerm"]);
  });

  it("adds and deletes in one pass", () => {
    insertLocal("Old");
    // Cloud drops "Old" and adds "New".
    const changed = mirrorCloudVocabularyTerms(["New"]);
    expect(changed).toBe(2); // 1 delete + 1 insert
    expect(loadVocabularyTerms()).toEqual(["New"]);
  });

  it("preserves local-only notes on surviving terms", () => {
    insertLocal("Documented", "keep this note");
    insertLocal("ToRemove", "will be deleted");

    mirrorCloudVocabularyTerms(["Documented"]);

    const row = getDb()
      .prepare("SELECT notes FROM vocabulary WHERE term = ?")
      .get("Documented") as { notes: string | null };
    expect(row.notes).toBe("keep this note");
    expect(loadVocabularyTerms()).toEqual(["Documented"]);
  });

  it("matches existing terms case-insensitively (no churn, notes kept)", () => {
    insertLocal("React", "framework");

    // Cloud sends a different casing of the same term — it should NOT be
    // deleted-and-reinserted (which would drop the note), just left as-is.
    const changed = mirrorCloudVocabularyTerms(["react"]);
    expect(changed).toBe(0);
    expect(loadVocabularyTerms()).toEqual(["React"]);

    const row = getDb()
      .prepare("SELECT notes FROM vocabulary WHERE term = ?")
      .get("React") as { notes: string | null };
    expect(row.notes).toBe("framework");
  });

  it("deduplicates within the incoming batch (case-insensitive)", () => {
    const changed = mirrorCloudVocabularyTerms(["Alpha", "alpha", "ALPHA"]);
    expect(changed).toBe(1);
    expect(loadVocabularyTerms()).toEqual(["Alpha"]);
  });

  it("trims whitespace and skips empty terms", () => {
    const changed = mirrorCloudVocabularyTerms(["  spaced  ", "", "   "]);
    expect(changed).toBe(1);
    expect(loadVocabularyTerms()).toEqual(["spaced"]);
  });

  it("clears all local terms when the cloud list is empty", () => {
    insertLocal("A");
    insertLocal("B");
    const changed = mirrorCloudVocabularyTerms([]);
    expect(changed).toBe(2); // both deleted
    expect(loadVocabularyTerms()).toEqual([]);
  });

  it("leaves cloud-pulled terms with null notes", () => {
    mirrorCloudVocabularyTerms(["NoNotes"]);
    const row = getDb()
      .prepare("SELECT notes FROM vocabulary WHERE term = ?")
      .get("NoNotes") as { notes: string | null };
    expect(row.notes).toBeNull();
  });

  it("is a no-op when local already matches the cloud set", () => {
    insertLocal("Same", "note");
    const changed = mirrorCloudVocabularyTerms(["Same"]);
    expect(changed).toBe(0);
    expect(loadVocabularyTerms()).toEqual(["Same"]);
  });
});
