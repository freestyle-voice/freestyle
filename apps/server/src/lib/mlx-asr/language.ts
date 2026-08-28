import { ISO_LANGUAGE_NAMES } from "../language.js";
import { getMlxAsrModel } from "./constants.js";

const QWEN3_LANGUAGE_NAMES = new Set([
  "Chinese",
  "English",
  "Cantonese",
  "Arabic",
  "German",
  "French",
  "Spanish",
  "Portuguese",
  "Indonesian",
  "Italian",
  "Korean",
  "Russian",
  "Thai",
  "Vietnamese",
  "Japanese",
  "Turkish",
  "Hindi",
  "Malay",
  "Dutch",
  "Swedish",
  "Danish",
  "Finnish",
  "Polish",
  "Czech",
  "Filipino",
  "Persian",
  "Greek",
  "Romanian",
  "Hungarian",
  "Macedonian",
]);

export function resolveMlxLanguage(
  modelId: string,
  language: string | undefined,
): string | undefined {
  if (!language || language === "auto") return undefined;
  if (getMlxAsrModel(modelId)?.family !== "qwen3-asr") return language;
  const name = ISO_LANGUAGE_NAMES[language];
  return name && QWEN3_LANGUAGE_NAMES.has(name) ? name : undefined;
}
