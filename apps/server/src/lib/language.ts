import { parseStoredLanguageList } from "@freestyle-voice/validations";
import { getDb } from "./db.js";

export const ISO_LANGUAGE_NAMES: Record<string, string> = {
  ar: "Arabic",
  cs: "Czech",
  da: "Danish",
  de: "German",
  el: "Greek",
  en: "English",
  es: "Spanish",
  fa: "Persian",
  fi: "Finnish",
  fr: "French",
  hi: "Hindi",
  hu: "Hungarian",
  id: "Indonesian",
  it: "Italian",
  ja: "Japanese",
  ko: "Korean",
  mk: "Macedonian",
  ms: "Malay",
  nl: "Dutch",
  no: "Norwegian",
  pl: "Polish",
  pt: "Portuguese",
  ro: "Romanian",
  ru: "Russian",
  sv: "Swedish",
  th: "Thai",
  tr: "Turkish",
  uk: "Ukrainian",
  vi: "Vietnamese",
  zh: "Chinese",
};

/**
 * Read the canonical transcription-language list from the `languages` setting
 * (a JSON array of ISO codes). Falls back to the legacy singular `language`
 * key for users who set a language before the multi-language migration, so an
 * existing choice is never silently dropped. Returns a normalized, deduped,
 * capped list; an empty array means auto-detect.
 */
export function getLanguagesSetting(): string[] {
  const db = getDb();
  const row = db
    .prepare("SELECT value FROM settings WHERE key = 'languages'")
    .get() as { value: string } | undefined;
  const legacy = db
    .prepare("SELECT value FROM settings WHERE key = 'language'")
    .get() as { value: string } | undefined;

  // The `languages` row is authoritative once present (including an explicit
  // empty array = auto-detect); only an absent row falls back to the legacy
  // singular `language` key, so a pre-migration choice is honored exactly once.
  return parseStoredLanguageList(row?.value, legacy?.value);
}

/**
 * Whether translate mode is enabled. Translate mode only applies when exactly
 * one language is resolved (the cloud enforces the same rule); with zero or
 * multiple languages there is no single target to enforce, so translate is off.
 */
export function getTranslateModeSetting(): boolean {
  if (getLanguagesSetting().length !== 1) return false;
  const row = getDb()
    .prepare("SELECT value FROM settings WHERE key = 'translate_mode'")
    .get() as { value: string } | undefined;
  return row?.value === "true";
}
