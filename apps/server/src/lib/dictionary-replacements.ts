import type { DatabaseSync } from "node:sqlite";

/** Apply user dictionary word replacements (longest keys first). */
const CJK_SCRIPT_RE =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const WORDLIKE_CHAR_CLASS = "[\\p{L}\\p{N}\\p{M}_]";

function buildDictionaryRegex(key: string): RegExp {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // Chinese/Japanese/Korean phrases are commonly written without spaces, so
  // "whole word" boundaries prevent valid replacements inside running text.
  if (CJK_SCRIPT_RE.test(key)) {
    return new RegExp(escaped, "gu");
  }

  const startsWordLike = /^[\p{L}\p{N}\p{M}_]/u.test(key);
  const endsWordLike = /[\p{L}\p{N}\p{M}_]$/u.test(key);
  const prefix = startsWordLike ? `(?<!${WORDLIKE_CHAR_CLASS})` : "";
  const suffix = endsWordLike ? `(?!${WORDLIKE_CHAR_CLASS})` : "";
  return new RegExp(`${prefix}${escaped}${suffix}`, "giu");
}

export function applyDictionaryReplacements(
  text: string,
  db: DatabaseSync,
): string {
  let cleanedText = text;

  try {
    const dictRows = db
      .prepare(
        "SELECT id, key, value FROM dictionary ORDER BY length(key) DESC",
      )
      .all() as { id: number; key: string; value: string }[];

    if (dictRows.length === 0) return cleanedText;

    const matchedIds: number[] = [];
    for (const { id, key, value } of dictRows) {
      const regex = buildDictionaryRegex(key);
      const nextText = cleanedText.replace(regex, value);
      if (nextText !== cleanedText) {
        matchedIds.push(id);
        cleanedText = nextText;
      }
    }

    if (matchedIds.length > 0) {
      const updateStmt = db.prepare(
        "UPDATE dictionary SET usage_count = usage_count + 1 WHERE id = ?",
      );
      for (const id of matchedIds) {
        updateStmt.run(id);
      }
    }
  } catch {
    // Dictionary table may not exist yet
  }

  return cleanedText;
}
