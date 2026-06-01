import { stripProviderPrefix } from "./streaming/types.js";
import {
  getTranscriptionContextPrompt,
  loadVocabularyTerms,
} from "./vocabulary.js";

/** ASR-only vocabulary bias (first recognition step). Not used in post-process. */
export type AsrVocabularyBias =
  | { kind: "prompt"; text: string }
  | { kind: "deepgram-keyterms"; terms: string[] }
  | { kind: "deepgram-keywords"; terms: string[] }
  | { kind: "elevenlabs-keyterms"; terms: string[] };

const PROMPT_CHAR_BUDGET = 900;
const DEEPGRAM_KEYTERM_MAX = 100;
/** Keep streaming URLs short — long keyterm lists break the WS handshake. */
const DEEPGRAM_STREAMING_KEYTERM_MAX = 25;
const ELEVENLABS_BATCH_KEYTERM_MAX = 100;
const ELEVENLABS_REALTIME_KEYTERM_MAX = 50;
const ELEVENLABS_TERM_MAX_CHARS = 20;
const ELEVENLABS_BATCH_TERM_MAX_CHARS = 50;

function capTerms(terms: string[], max: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of terms) {
    const term = raw.trim();
    if (!term) continue;
    const key = term.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(term);
    if (out.length >= max) break;
  }
  return out;
}

function buildPromptText(
  terms: string[],
  contextPrompt?: string,
): string | null {
  const parts: string[] = [];
  if (contextPrompt?.trim()) parts.push(contextPrompt.trim());

  if (terms.length > 0) {
    let list = terms.join(", ");
    const prefix = parts.length > 0 ? " Terms: " : "Terms: ";
    const budget = PROMPT_CHAR_BUDGET - parts.join(" ").length - prefix.length;
    if (budget > 0 && list.length > budget) {
      const trimmed: string[] = [];
      let len = 0;
      for (const t of terms) {
        const next = trimmed.length === 0 ? t : `${trimmed.join(", ")}, ${t}`;
        if (next.length > budget) break;
        trimmed.push(t);
        len = next.length;
        void len;
      }
      list = trimmed.join(", ");
    }
    if (list) {
      parts.push(parts.length > 0 ? `Terms: ${list}.` : `Terms: ${list}.`);
    }
  }

  const text = parts.join(" ").trim();
  if (!text) return null;
  return text.slice(0, PROMPT_CHAR_BUDGET);
}

function expandNova2Keywords(terms: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const phrase of terms) {
    for (const word of phrase.split(/\s+/)) {
      const w = word.trim();
      if (!w) continue;
      const key = w.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(w);
      if (out.length >= DEEPGRAM_KEYTERM_MAX) return out;
    }
  }
  return out;
}

function capElevenLabsTerms(
  terms: string[],
  maxCount: number,
  maxChars: number,
): string[] {
  return capTerms(
    terms.map((t) => (t.length > maxChars ? t.slice(0, maxChars) : t)),
    maxCount,
  );
}

function isNova3Model(model: string): boolean {
  return model.includes("nova-3");
}

function isNova2Model(model: string): boolean {
  return model.includes("nova-2");
}

function supportsElevenLabsKeyterms(model: string): boolean {
  return model.includes("scribe_v2");
}

/**
 * Build provider-specific ASR bias from vocabulary terms.
 * Returns null when there is nothing to send or the model does not support bias.
 */
export function buildAsrVocabularyBias(
  providerId: string,
  modelId: string,
  terms: string[],
  contextPrompt?: string,
  streaming = false,
): AsrVocabularyBias | null {
  const capped = capTerms(terms, DEEPGRAM_KEYTERM_MAX);
  if (capped.length === 0 && !contextPrompt?.trim()) return null;

  const short = stripProviderPrefix(modelId);

  switch (providerId) {
    case "openai":
    case "groq": {
      const text = buildPromptText(capped, contextPrompt);
      return text ? { kind: "prompt", text } : null;
    }
    case "deepgram": {
      if (isNova3Model(short)) {
        const max = streaming
          ? DEEPGRAM_STREAMING_KEYTERM_MAX
          : DEEPGRAM_KEYTERM_MAX;
        const keyterms = capTerms(capped, max);
        return keyterms.length > 0
          ? { kind: "deepgram-keyterms", terms: keyterms }
          : null;
      }
      if (isNova2Model(short)) {
        const max = streaming
          ? DEEPGRAM_STREAMING_KEYTERM_MAX
          : DEEPGRAM_KEYTERM_MAX;
        const keywords = expandNova2Keywords(capTerms(capped, max));
        return keywords.length > 0
          ? { kind: "deepgram-keywords", terms: keywords }
          : null;
      }
      return null;
    }
    case "elevenlabs": {
      if (!supportsElevenLabsKeyterms(short)) return null;
      const max = streaming
        ? ELEVENLABS_REALTIME_KEYTERM_MAX
        : ELEVENLABS_BATCH_KEYTERM_MAX;
      const maxChars = streaming
        ? ELEVENLABS_TERM_MAX_CHARS
        : ELEVENLABS_BATCH_TERM_MAX_CHARS;
      const keyterms = capElevenLabsTerms(capped, max, maxChars);
      return keyterms.length > 0
        ? { kind: "elevenlabs-keyterms", terms: keyterms }
        : null;
    }
    case "local-mlx": {
      const parts: string[] = [];
      if (contextPrompt?.trim()) parts.push(contextPrompt.trim());
      if (capped.length > 0) {
        parts.push(`Technical terms: ${capped.join(", ")}`);
      }
      const text = parts.join(" ").trim().slice(0, PROMPT_CHAR_BUDGET);
      return text ? { kind: "prompt", text } : null;
    }
    default:
      return null;
  }
}

export function resolveAsrVocabularyBias(
  providerId: string,
  modelId: string,
  streaming = false,
): AsrVocabularyBias | null {
  const terms = loadVocabularyTerms();
  const contextPrompt = getTranscriptionContextPrompt();
  return buildAsrVocabularyBias(
    providerId,
    modelId,
    terms,
    contextPrompt,
    streaming,
  );
}
