import { getDb } from "./db.js";

export interface VocabularyRow {
  id: number;
  term: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/** All vocabulary terms for ASR biasing, longest first for provider limits. */
export function loadVocabularyTerms(): string[] {
  const db = getDb();
  try {
    const rows = db
      .prepare(
        "SELECT term FROM vocabulary ORDER BY length(term) DESC, created_at DESC",
      )
      .all() as { term: string }[];
    return rows.map((r) => r.term.trim()).filter(Boolean);
  } catch (err) {
    console.error("[vocabulary] Failed to load vocabulary terms:", err);
    return [];
  }
}

export function getTranscriptionContextPrompt(): string | undefined {
  const db = getDb();
  try {
    const row = db
      .prepare("SELECT value FROM settings WHERE key = 'transcription_prompt'")
      .get() as { value: string } | undefined;
    const value = row?.value?.trim();
    return value || undefined;
  } catch {
    return undefined;
  }
}
