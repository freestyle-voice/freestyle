import type { DatabaseSync } from "node:sqlite";

/** Apply user dictionary word replacements (longest keys first). */
const CJK_SCRIPT_RE =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const WORDLIKE_CHAR_CLASS = "[\\p{L}\\p{N}\\p{M}_]";

// A key always compiles to the same regex, so cache compiled patterns across
// transcripts instead of recompiling every dictionary row per dictation.
const REGEX_CACHE_MAX = 5000;
const regexCache = new Map<string, RegExp>();

function buildDictionaryRegex(key: string): RegExp {
  const cached = regexCache.get(key);
  if (cached) return cached;

  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // Chinese/Japanese/Korean phrases are commonly written without spaces, so
  // "whole word" boundaries prevent valid replacements inside running text.
  let regex: RegExp;
  if (CJK_SCRIPT_RE.test(key)) {
    regex = new RegExp(escaped, "gu");
  } else {
    const startsWordLike = /^[\p{L}\p{N}\p{M}_]/u.test(key);
    const endsWordLike = /[\p{L}\p{N}\p{M}_]$/u.test(key);
    const prefix = startsWordLike ? `(?<!${WORDLIKE_CHAR_CLASS})` : "";
    const suffix = endsWordLike ? `(?!${WORDLIKE_CHAR_CLASS})` : "";
    regex = new RegExp(`${prefix}${escaped}${suffix}`, "giu");
  }

  if (regexCache.size >= REGEX_CACHE_MAX) regexCache.clear();
  regexCache.set(key, regex);
  return regex;
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
      // Function replacer: values are inserted literally, so `$&`, `$1`,
      // `` $` `` etc. in a user's replacement are never interpreted.
      const nextText = cleanedText.replace(regex, () => value);
      if (nextText !== cleanedText) {
        matchedIds.push(id);
        cleanedText = nextText;
      }
    }

    if (matchedIds.length > 0) {
      const placeholders = matchedIds.map(() => "?").join(",");
      db.prepare(
        `UPDATE dictionary SET usage_count = usage_count + 1 WHERE id IN (${placeholders})`,
      ).run(...matchedIds);
    }
  } catch {
    // Dictionary table may not exist yet
  }

  return cleanedText;
}
