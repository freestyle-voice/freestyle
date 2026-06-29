/** Transcript cleanup prompt assembly (intensity preset + dynamic blocks). */

import {
  CLEANUP_PRESET_PROMPTS,
  type CleanupIntensity,
} from "@freestyle-voice/validations";

export type RewriteRegisterMode = "neutral" | "formal" | "casual";

const LANGUAGE_LABELS: Record<string, string> = {
  ar: "Arabic",
  de: "German",
  en: "English",
  es: "Spanish",
  fa: "Persian",
  fr: "French",
  he: "Hebrew",
  hi: "Hindi",
  it: "Italian",
  ja: "Japanese",
  ko: "Korean",
  nl: "Dutch",
  pt: "Portuguese",
  ru: "Russian",
  ur: "Urdu",
  zh: "Simplified Chinese",
  "zh-cn": "Simplified Chinese",
  "zh-hans": "Simplified Chinese",
  "zh-sg": "Simplified Chinese",
  "zh-tw": "Traditional Chinese",
  "zh-hant": "Traditional Chinese",
};

const DISALLOWED_CONTEXT_HINT_PATTERNS = [
  /\bprofessional\b/i,
  /\bcasual\b/i,
  /\bconversational\b/i,
  /\bconcise\b/i,
  /\bbrief\b/i,
  /\bpunchy\b/i,
  /\bdirect\b/i,
  /\bwell-structured\b/i,
  /\btone\b/i,
  /\b280\s*chars?\b/i,
  /\btext message\b/i,
  /\bprompt or message\b/i,
  /\bminimal punctuation\b/i,
  /\blowercase\b/i,
  /\ball lowercase\b/i,
  /\bundercase(?:d)?\b/i,
];

export function sanitizeContextHint(contextHint: string): string {
  const clauses = contextHint
    .split(/(?<=[.;])\s+/)
    .map((clause) => clause.trim())
    .filter(Boolean);

  const filtered = clauses.filter(
    (clause) =>
      !DISALLOWED_CONTEXT_HINT_PATTERNS.some((pattern) => pattern.test(clause)),
  );

  return filtered.join(" ").trim();
}

function buildRegisterBlock(registerMode: RewriteRegisterMode): string {
  switch (registerMode) {
    case "formal":
      return `\n\nContext-specific register hint: the destination app is relatively formal or professional. You SHOULD lightly normalize obvious casual shorthand when it would look out of place there (for example: "gonna" -> "going to", "wanna" -> "want to", "cuz" -> "because", "thx" -> "thanks"). Replace only the shorthand token itself and keep the surrounding clauses, greetings, lead-ins, ordering, and sentence structure intact. Do not delete polite framing phrases merely because they sound informal. Do not otherwise rewrite tone, sentence structure, or level of formality.`;
    case "casual":
      return `\n\nContext-specific register hint: the destination app is casual or chat-like. Preserve casual wording as spoken, including colloquialisms such as "gonna", "wanna", and "cuz", unless there is a clear transcription error.`;
    default:
      return "";
  }
}

function normalizeLanguageCode(language: string): string {
  return language.trim().toLowerCase().replace(/_/g, "-");
}

const AUTO_LANGUAGE_CONSTRAINT =
  "\n\nLanguage constraint: return the final edited text in the same language and script as the transcript. Do not translate to English or any other language. If the transcript mixes languages, preserve each span in the language spoken. The English examples in the instructions above demonstrate editing behavior only; they do not change the output language.";

export function buildLanguageBlock(language: string | undefined): string {
  if (!language?.trim()) return AUTO_LANGUAGE_CONSTRAINT;

  const normalized = normalizeLanguageCode(language);
  if (normalized === "auto") return AUTO_LANGUAGE_CONSTRAINT;

  const baseCode = normalized.split("-")[0] ?? normalized;
  const label = LANGUAGE_LABELS[normalized] ?? LANGUAGE_LABELS[baseCode];
  const descriptor = label ? label : `language code "${language}"`;
  const punctuationHint = normalized.startsWith("zh")
    ? " Use standard Chinese punctuation."
    : "";

  return `\n\nLanguage constraint: the transcript language is ${descriptor}. Return the final edited text in the same language and script. Do not translate to English or another language. If the transcript mixes languages, preserve each span in the language spoken.${punctuationHint}`;
}

/**
 * Resolve the base system prompt for a given cleanup intensity. For "custom",
 * the user-authored prompt is used when present, otherwise we fall back to the
 * "low" preset so cleanup still does something safe.
 */
export function resolveBaseCleanupPrompt(
  intensity: CleanupIntensity,
  customPrompt?: string,
): string {
  if (intensity === "custom") {
    const trimmed = customPrompt?.trim();
    return trimmed ? trimmed : CLEANUP_PRESET_PROMPTS.low;
  }
  return CLEANUP_PRESET_PROMPTS[intensity];
}

export function buildRewritePrompt(
  inputText: string,
  options?: {
    contextHint?: string;
    language?: string;
    registerMode?: RewriteRegisterMode;
    intensity?: CleanupIntensity;
    customPrompt?: string;
  },
): { system: string; prompt: string } {
  const contextHint = options?.contextHint?.trim()
    ? sanitizeContextHint(options.contextHint.trim())
    : "";
  const contextBlock = contextHint
    ? `\n\nWeak context hint: use this only when the transcript already clearly implies it. Never change tone, shorten the text, or add new structure because of this hint.\n${contextHint}`
    : "";
  const registerBlock = buildRegisterBlock(options?.registerMode ?? "neutral");
  const languageBlock = buildLanguageBlock(options?.language);
  const baseSystem = resolveBaseCleanupPrompt(
    options?.intensity ?? "low",
    options?.customPrompt,
  );

  return {
    system: baseSystem + languageBlock + contextBlock + registerBlock,
    prompt: `<transcript>\n${inputText}\n</transcript>`,
  };
}
