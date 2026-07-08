import { createAppLogger } from "@freestyle-voice/utils";
import { getDb } from "./db.js";

const log = createAppLogger("vocabulary");

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
    log.error(`Failed to load vocabulary terms: ${err}`);
    return [];
  }
}

/**
 * Raw custom-vocabulary bias forwarded to Freestyle Cloud's `/v2/transcribe`.
 * The cloud assembles the recognizer prompt from these terms, so the desktop
 * sends the raw values rather than a formatted prompt. Shape mirrors the
 * cloud's `{ terms }` contract.
 */
export interface CloudVocabularyBias {
  terms: string[];
}

/**
 * Collect the user's vocabulary terms for the cloud batch transcription path.
 * Returns `undefined` when there is nothing to send so callers can omit the
 * field entirely.
 */
export function getCloudVocabularyBias(): CloudVocabularyBias | undefined {
  const terms = loadVocabularyTerms();
  if (terms.length === 0) return undefined;
  return { terms };
}
