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

/** An entry accepted by {@link importVocabularyEntries}. */
export interface VocabularyImportEntry {
  term: string;
  notes?: string | null;
}

/**
 * Insert many vocabulary entries in one transaction, skipping blanks and
 * duplicates (`INSERT OR IGNORE`). Returns the counts so the caller can report
 * them and decide whether to push to the cloud.
 *
 * node:sqlite (`DatabaseSync`) has no `.transaction()` helper, so the batch is
 * wrapped in explicit BEGIN/COMMIT.
 */
export function importVocabularyEntries(entries: VocabularyImportEntry[]): {
  imported: number;
  skipped: number;
} {
  const db = getDb();
  let imported = 0;
  let skipped = 0;
  const insertStmt = db.prepare(
    "INSERT OR IGNORE INTO vocabulary (term, notes) VALUES (?, ?)",
  );

  db.exec("BEGIN");
  try {
    for (const entry of entries) {
      const term = entry.term.trim();
      if (!term) {
        skipped++;
        continue;
      }
      const result = insertStmt.run(term, entry.notes?.trim() || null);
      if (result.changes > 0) imported++;
      else skipped++;
    }
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }

  return { imported, skipped };
}

/** All entries as `{ term, notes }`, sorted by term ascending (export order). */
export function exportVocabularyEntries(): VocabularyEntry[] {
  return getDb()
    .prepare("SELECT term, notes FROM vocabulary ORDER BY term ASC")
    .all() as unknown as VocabularyEntry[];
}

/**
 * Delete many vocabulary rows by id in one transaction. Ids are deduped so a
 * repeated id doesn't skew the count. Returns the number of rows actually
 * removed (ids that didn't exist are ignored).
 */
export function deleteVocabularyByIds(ids: number[]): number {
  const db = getDb();
  const unique = [...new Set(ids)];
  let deleted = 0;
  const remove = db.prepare("DELETE FROM vocabulary WHERE id = ?");

  db.exec("BEGIN");
  try {
    for (const id of unique) {
      const result = remove.run(id);
      if (result.changes > 0) deleted++;
    }
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }

  return deleted;
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
 * Mirror the local `vocabulary` table to the cloud's canonical term set.
 *
 * The cloud is authoritative for vocabulary: the desktop pushes its full term
 * list up on every local edit (see `pushVocabularyToCloud`), and the cloud
 * replaces its stored `terms` array wholesale. So on pull we make the local
 * table an exact mirror of the cloud set:
 *
 *   - **insert** cloud terms not already present locally (case-insensitive),
 *   - **delete** local terms the cloud no longer has,
 *   - **preserve notes** on surviving terms — cloud terms carry no notes (the
 *     cloud shape is `{ terms, text }`), so notes are a local-only enrichment
 *     that must never be clobbered by a pull.
 *
 * Returns the number of local rows changed (inserted + deleted) so callers can
 * treat a pull that only touched vocabulary as "applied".
 *
 * Uses node:sqlite (`DatabaseSync`), which has no `.transaction()` helper, so
 * the batch is wrapped in explicit BEGIN/COMMIT like the import route.
 */
export function mirrorCloudVocabularyTerms(terms: string[]): number {
  const db = getDb();

  // Canonical cloud set, keyed case-insensitively (the cloud dedupes the same
  // way, so a case-only difference is not a distinct term).
  const cloudByKey = new Map<string, string>();
  for (const raw of terms) {
    const term = raw.trim();
    if (!term) continue;
    const key = term.toLowerCase();
    if (!cloudByKey.has(key)) cloudByKey.set(key, term);
  }

  const localRows = db.prepare("SELECT id, term FROM vocabulary").all() as {
    id: number;
    term: string;
  }[];
  const localKeys = new Set(localRows.map((r) => r.term.trim().toLowerCase()));

  const insert = db.prepare(
    "INSERT OR IGNORE INTO vocabulary (term, notes) VALUES (?, NULL)",
  );
  const remove = db.prepare("DELETE FROM vocabulary WHERE id = ?");

  let changed = 0;
  db.exec("BEGIN");
  try {
    // Delete local terms the cloud no longer has.
    for (const row of localRows) {
      if (!cloudByKey.has(row.term.trim().toLowerCase())) {
        const result = remove.run(row.id);
        if (result.changes > 0) changed++;
      }
    }
    // Insert cloud terms missing locally (notes left NULL — local enrichment).
    for (const [key, term] of cloudByKey) {
      if (localKeys.has(key)) continue;
      const result = insert.run(term);
      if (result.changes > 0) changed++;
    }
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    log.error(`Failed to mirror cloud vocabulary terms: ${err}`);
    return 0;
  }

  if (changed > 0) {
    log.info(`Mirrored vocabulary from Freestyle Cloud (${changed} row(s))`);
  }
  return changed;
}
