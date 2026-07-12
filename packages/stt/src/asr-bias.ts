/**
 * Build a free-text "initial prompt" hint to bias ASR recognition toward a
 * speaker's custom vocabulary (names, jargon, acronyms) and optional
 * background context.
 *
 * This targets providers that accept a short free-text prompt hint (e.g.
 * OpenAI/Groq Whisper, local whisper.cpp, MLX). It does NOT cover structured
 * vocabulary-bias schemes some providers use instead (e.g. Deepgram
 * keyterms/keywords, ElevenLabs keyterms, Soniox context arrays) — those
 * providers expect a list of discrete terms, not a single prompt string, and
 * need their own request shape.
 *
 * The prompt hint is packed under a fixed character budget (providers with a
 * free-text hint typically bound it to a couple hundred tokens), with terms
 * de-duplicated and packed to fit as many as possible.
 */

/**
 * Default upper bound on the assembled prompt. Tuned for Whisper-style
 * providers (~900 English chars ≈ Whisper's ~224-token initial-prompt
 * limit). Override via {@link BuildAsrBiasPromptOptions.maxChars} for
 * providers with a different limit, or for non-English/dense scripts where
 * character count doesn't map to token count the same way.
 */
const DEFAULT_MAX_CHARS = 900;

/**
 * Minimum characters reserved for the vocabulary-terms section whenever at
 * least one term is supplied, even if `context` is long enough to otherwise
 * consume the whole budget. Terms are the primary recognition-bias signal;
 * a long free-text context should not be able to silently drop all of them.
 */
const DEFAULT_MIN_TERMS_CHARS = 200;

export interface AsrBiasInput {
  /** Custom-vocabulary terms (names, jargon, acronyms). */
  terms?: string[];
  /** Free-text background context prepended to the bias prompt. */
  context?: string;
}

export interface BuildAsrBiasPromptOptions {
  /** @see {@link DEFAULT_MAX_CHARS} */
  maxChars?: number;
  /** @see {@link DEFAULT_MIN_TERMS_CHARS} */
  minTermsChars?: number;
}

/** Truncate to `maxChars`, backing off to the last word boundary when it's close by. */
function truncateAtWordBoundary(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const slice = text.slice(0, maxChars);
  const lastSpace = slice.lastIndexOf(" ");
  // Only back off to the boundary if doing so doesn't throw away too much
  // of the available budget (otherwise a single very long "word" would
  // collapse the slice to near-nothing).
  return lastSpace > maxChars * 0.6 ? slice.slice(0, lastSpace) : slice;
}

/**
 * Assemble the ASR bias prompt string, or `undefined` when there is nothing
 * to bias with. The result never exceeds `options.maxChars` (default 900).
 */
export function buildAsrBiasPrompt(
  input: AsrBiasInput,
  options: BuildAsrBiasPromptOptions = {},
): string | undefined {
  const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;
  const minTermsChars = options.minTermsChars ?? DEFAULT_MIN_TERMS_CHARS;

  const context = input.context?.trim();

  const seen = new Set<string>();
  const terms: string[] = [];
  for (const raw of input.terms ?? []) {
    const term = raw.trim();
    if (!term) continue;
    const key = term.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    terms.push(term);
  }

  const parts: string[] = [];

  if (context) {
    // Reserve room for terms up front so a long context can never starve
    // every vocabulary term out of the budget.
    const contextBudget =
      terms.length > 0 ? Math.max(maxChars - minTermsChars, 0) : maxChars;
    const truncated = truncateAtWordBoundary(context, contextBudget);
    if (truncated) parts.push(truncated);
  }

  if (terms.length > 0) {
    const prefix = "Terms: ";
    const used = parts.length > 0 ? parts.join(" ").length + 1 : 0;
    const remaining = maxChars - used;
    let list = "";
    for (const term of terms) {
      const next = list ? `${list}, ${term}` : term;
      // A term that doesn't fit doesn't mean later (possibly shorter) terms
      // won't — skip it and keep trying, rather than giving up entirely.
      // This matters in practice: callers commonly pass terms sorted
      // longest-first, so bailing out on the first miss would silently drop
      // every shorter term that follows.
      if (prefix.length + next.length + 1 > remaining) continue;
      list = next;
    }
    if (list) parts.push(`${prefix}${list}.`);
  }

  const prompt = parts.join(" ").trim();
  return prompt ? prompt : undefined;
}
