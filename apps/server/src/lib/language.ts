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

export function normalizeLanguageSetting(
  value: string | null | undefined,
): string | undefined {
  if (!value || value === "auto") return undefined;
  return value;
}

export function getLanguageSetting(): string | undefined {
  const row = getDb()
    .prepare("SELECT value FROM settings WHERE key = 'language'")
    .get() as { value: string } | undefined;
  return normalizeLanguageSetting(row?.value);
}
