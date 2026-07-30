import { afterEach, describe, expect, it } from "vitest";
import { getDb } from "../src/lib/db.js";
import {
  loadVocabularyTerms,
  mergeCloudVocabularyTerms,
} from "../src/lib/vocabulary.js";

function reset(): void {
  getDb().exec("DELETE FROM vocabulary");
}

afterEach(reset);

describe("mergeCloudVocabularyTerms", () => {
  it("inserts terms into an empty table", () => {
    const inserted = mergeCloudVocabularyTerms(["Freestyle", "Kubernetes"]);
    expect(inserted).toBe(2);
    expect(loadVocabularyTerms().sort()).toEqual(["Freestyle", "Kubernetes"]);
  });

  it("is non-destructive: keeps existing local terms and adds new ones", () => {
    const db = getDb();
    db.prepare("INSERT INTO vocabulary (term, notes) VALUES (?, ?)").run(
      "LocalOnly",
      "user note",
    );

    const inserted = mergeCloudVocabularyTerms(["CloudTerm"]);
    expect(inserted).toBe(1);
    expect(loadVocabularyTerms().sort()).toEqual(["CloudTerm", "LocalOnly"]);

    // The pre-existing term's note is untouched.
    const row = db
      .prepare("SELECT notes FROM vocabulary WHERE term = ?")
      .get("LocalOnly") as { notes: string | null };
    expect(row.notes).toBe("user note");
  });

  it("skips terms already present (case-insensitive)", () => {
    const db = getDb();
    db.prepare("INSERT INTO vocabulary (term, notes) VALUES (?, ?)").run(
      "React",
      null,
    );

    const inserted = mergeCloudVocabularyTerms(["react", "REACT", "Vue"]);
    expect(inserted).toBe(1); // only "Vue" is new
    expect(loadVocabularyTerms().sort()).toEqual(["React", "Vue"]);
  });

  it("deduplicates within the incoming batch (case-insensitive)", () => {
    const inserted = mergeCloudVocabularyTerms(["Alpha", "alpha", "ALPHA"]);
    expect(inserted).toBe(1);
    expect(loadVocabularyTerms()).toEqual(["Alpha"]);
  });

  it("trims whitespace and skips empty terms", () => {
    const inserted = mergeCloudVocabularyTerms(["  spaced  ", "", "   "]);
    expect(inserted).toBe(1);
    expect(loadVocabularyTerms()).toEqual(["spaced"]);
  });

  it("no-ops on an empty term list", () => {
    expect(mergeCloudVocabularyTerms([])).toBe(0);
    expect(loadVocabularyTerms()).toEqual([]);
  });

  it("leaves cloud-pulled terms with null notes", () => {
    mergeCloudVocabularyTerms(["NoNotes"]);
    const row = getDb()
      .prepare("SELECT notes FROM vocabulary WHERE term = ?")
      .get("NoNotes") as { notes: string | null };
    expect(row.notes).toBeNull();
  });
});
