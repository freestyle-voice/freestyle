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

export interface VocabularyEntry {
  term: string;
  notes: string | null;
}

export function loadVocabularyEntries(): VocabularyEntry[] {
  const db = getDb();
  try {
    const rows = db
      .prepare(
        "SELECT term, notes FROM vocabulary ORDER BY length(term) DESC, created_at DESC",
      )
      .all() as { term: string; notes: string | null }[];
    return rows
      .map((r) => ({ term: r.term.trim(), notes: r.notes?.trim() || null }))
      .filter((r) => r.term.length > 0);
  } catch (err) {
    log.error(`Failed to load vocabulary terms: ${err}`);
    return [];
  }
}

/** All vocabulary terms for ASR biasing, longest first for provider limits. */
export function loadVocabularyTerms(): string[] {
  return loadVocabularyEntries().map((e) => e.term);
}

const NOTE_TEXT_MAX_CHARS = 2000;

export function buildVocabularyNoteText(
  entries: VocabularyEntry[],
): string | undefined {
  const lines: string[] = [];
  let used = 0;
  for (const entry of entries) {
    if (!entry.notes) continue;
    const line = `${entry.term}: ${entry.notes}`;
    if (used + line.length + 1 > NOTE_TEXT_MAX_CHARS) continue;
    lines.push(line);
    used += line.length + 1;
  }
  return lines.length > 0 ? lines.join("\n") : undefined;
}

/**
 * Raw custom-vocabulary bias forwarded to Freestyle Cloud's `/v2/transcribe`.
 * The cloud assembles the recognizer prompt from these terms, so the desktop
 * sends the raw values rather than a formatted prompt. Shape mirrors the
 * cloud's `{ terms, text }` contract.
 */
export interface CloudVocabularyBias {
  terms: string[];
  text?: string;
}

/**
 * Collect the user's vocabulary terms for the cloud batch transcription path.
 * Returns `undefined` when there is nothing to send so callers can omit the
 * field entirely.
 */
export function getCloudVocabularyBias(): CloudVocabularyBias | undefined {
  const entries = loadVocabularyEntries();
  if (entries.length === 0) return undefined;
  const text = buildVocabularyNoteText(entries);
  return { terms: entries.map((e) => e.term), ...(text ? { text } : {}) };
}
