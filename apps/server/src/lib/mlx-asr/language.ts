import { ISO_LANGUAGE_NAMES } from "../language.js";
import { getMlxAsrModel, MLX_ASR_PROVIDER_ID } from "./constants.js";

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

function getLocalModelId(modelId: string): string {
  const prefix = `${MLX_ASR_PROVIDER_ID}/`;
  return modelId.startsWith(prefix) ? modelId.slice(prefix.length) : modelId;
}

export function resolveMlxLanguage(
  modelId: string,
  language: string | undefined,
): string | undefined {
  if (!language || language === "auto") return undefined;
  if (getMlxAsrModel(getLocalModelId(modelId))?.family !== "qwen3-asr") {
    return language;
  }
  const name = ISO_LANGUAGE_NAMES[language];
  return name && QWEN3_LANGUAGE_NAMES.has(name) ? name : undefined;
}

/**
 * Qwen3-ASR accepts one language bias per request, not a list. Keep the bias
 * for a deliberate single-language selection; let Qwen identify the language
 * when the user selected auto-detect or multiple languages.
 */
export function resolveMlxLanguageSelection(
  modelId: string,
  languages: string[] | undefined,
): string | undefined {
  if (
    getMlxAsrModel(getLocalModelId(modelId))?.family === "qwen3-asr" &&
    languages?.length !== 1
  ) {
    return undefined;
  }
  return resolveMlxLanguage(modelId, languages?.[0]);
}
