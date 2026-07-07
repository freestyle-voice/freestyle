import { diffWords as jsDiffWords } from "diff";

export interface DiffSegment {
  type: "same" | "del" | "add";
  text: string;
}

/**
 * Word-level diff between the raw transcription and the AI-cleaned text.
 *
 * Backed by jsdiff, which uses a Myers diff (no quadratic table) and
 * `Intl.Segmenter` for word segmentation — so it works for spaceless scripts
 * (Chinese, Japanese, Korean, Thai) as well as whitespace-delimited languages.
 *
 * Returns segments in reading order: `same` for unchanged words, `del` for
 * words the post-processing removed, `add` for words it added. Each segment's
 * `text` preserves the original surrounding whitespace.
 */
export function diffWords(rawText: string, cleanedText: string): DiffSegment[] {
  return jsDiffWords(rawText, cleanedText).map((part) => ({
    type: part.added ? "add" : part.removed ? "del" : "same",
    text: part.value,
  }));
}
