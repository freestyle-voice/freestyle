import { diffWords } from "diff";

function wordCount(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

/**
 * Number of words post-processing changed, counted from a word-level diff of
 * the raw transcript against the cleaned text (same jsdiff the renderer uses
 * for diff mode). A removal immediately followed by an insertion is one
 * replacement and counts as the larger side, so "helo world" → "hello world"
 * is 1 fix, not 2.
 */
export function countFixes(
  rawText: string,
  cleanedText: string | null,
): number {
  if (!cleanedText || cleanedText === rawText) return 0;

  const parts = diffWords(rawText, cleanedText);
  let fixes = 0;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part.removed) {
      const next = parts[i + 1];
      if (next?.added) {
        fixes += Math.max(wordCount(part.value), wordCount(next.value));
        i++;
      } else {
        fixes += wordCount(part.value);
      }
    } else if (part.added) {
      fixes += wordCount(part.value);
    }
  }
  return fixes;
}
