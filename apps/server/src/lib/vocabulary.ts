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

/**
 * Merge cloud-seeded vocabulary terms into the local `vocabulary` table.
 *
 * Additive and non-destructive: inserts terms not already present (unique on
 * `term`, matched case-insensitively against existing rows) and never deletes
 * local terms. Cloud-pulled terms carry no notes (the cloud shape is
 * `{ terms, text }`), so `notes` is left `NULL` — notes are a local-only
 * enrichment. Returns the number of newly inserted terms.
 *
 * Vocabulary sync is currently one-way (cloud → local): the cloud seeds an
 * industry's terms into `member_preferences`, and this lands them locally where
 * `getCloudVocabularyBias()` picks them up for each transcription request.
 *
 * Uses node:sqlite (`DatabaseSync`), which has no `.transaction()` helper, so
 * the batch is wrapped in explicit BEGIN/COMMIT like the import route.
 */
export function mergeCloudVocabularyTerms(terms: string[]): number {
  if (terms.length === 0) return 0;
  const db = getDb();

  const existing = new Set(
    (db.prepare("SELECT term FROM vocabulary").all() as { term: string }[]).map(
      (r) => r.term.trim().toLowerCase(),
    ),
  );
  const insert = db.prepare(
    "INSERT OR IGNORE INTO vocabulary (term, notes) VALUES (?, NULL)",
  );

  let inserted = 0;
  db.exec("BEGIN");
  try {
    for (const raw of terms) {
      const term = raw.trim();
      if (!term || existing.has(term.toLowerCase())) continue;
      const result = insert.run(term);
      if (result.changes > 0) {
        inserted++;
        existing.add(term.toLowerCase());
      }
    }
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    log.error(`Failed to merge cloud vocabulary terms: ${err}`);
    return 0;
  }

  if (inserted > 0) {
    log.info(`Merged ${inserted} vocabulary term(s) from Freestyle Cloud`);
  }
  return inserted;
}
