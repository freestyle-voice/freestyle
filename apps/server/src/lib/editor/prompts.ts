/** Transcript cleanup prompt assembly (intensity preset + dynamic blocks). */

import {
  type CleanupEmailTone,
  type CleanupIntensity,
  type CleanupOverallTone,
  type CleanupPersonalTone,
  type CleanupToneDestination,
  type CleanupWorkTone,
  DEFAULT_CLEANUP_EMAIL_TONE,
  DEFAULT_CLEANUP_INTENSITY,
  DEFAULT_CLEANUP_OVERALL_TONE,
  DEFAULT_CLEANUP_PERSONAL_TONE,
  DEFAULT_CLEANUP_WORK_TONE,
} from "@freestyle-voice/validations";
import { getCleanupPromptConfig } from "./prompt-config.js";

function normalizeLanguageCode(language: string): string {
  return language.trim().toLowerCase().replace(/_/g, "-");
}

export function buildLanguageBlock(language: string | undefined): string {
  const config = getCleanupPromptConfig();
  if (!language?.trim()) return config.autoLanguageConstraint;

  const normalized = normalizeLanguageCode(language);
  if (normalized === "auto") return config.autoLanguageConstraint;

  const baseCode = normalized.split("-")[0] ?? normalized;
  const label =
    config.languageLabels[normalized] ?? config.languageLabels[baseCode];
  const descriptor = label ? label : `language code "${language}"`;
  const punctuationHint = normalized.startsWith("zh")
    ? " Use standard Chinese punctuation."
    : "";

  return `\n\nLanguage constraint: the transcript language is ${descriptor}. Return the final edited text in the same language and script. Do not translate to English or another language. If the transcript mixes languages, preserve each span in the language spoken.${punctuationHint}`;
}

function buildDestinationToneBlock(options: {
  destination: CleanupToneDestination;
  personalTone?: CleanupPersonalTone;
  personalSurface?: "discord" | null;
  workTone?: CleanupWorkTone;
  emailTone?: CleanupEmailTone;
  overallTone?: CleanupOverallTone;
}): string {
  const config = getCleanupPromptConfig();
  const priority = config.destinationPriorityBlock;
  const toneBlocks = config.toneBlocks;

  // A sector tone of "off" means styling is turned off for that destination:
  // skip the priority block, the tone block, and (for email) the structure
  // block, so cleanup runs the base preset only.
  switch (options.destination) {
    case "personal": {
      const tone = options.personalTone ?? DEFAULT_CLEANUP_PERSONAL_TONE;
      if (tone === "off") return "";
      return (
        priority +
        toneBlocks.personal[tone] +
        (tone === "casual" && options.personalSurface === "discord"
          ? toneBlocks.discordCasualOverlay
          : "")
      );
    }
    case "work": {
      const tone = options.workTone ?? DEFAULT_CLEANUP_WORK_TONE;
      if (tone === "off") return "";
      return priority + toneBlocks.work[tone];
    }
    case "email": {
      const tone = options.emailTone ?? DEFAULT_CLEANUP_EMAIL_TONE;
      if (tone === "off") return "";
      return priority + toneBlocks.email[tone] + toneBlocks.emailStructure;
    }
    default: {
      const tone = options.overallTone ?? DEFAULT_CLEANUP_OVERALL_TONE;
      if (tone === "off") return "";
      return priority + toneBlocks.overall[tone];
    }
  }
}

function buildDestinationUserPromptBlock(options: {
  destination: CleanupToneDestination;
  personalTone?: CleanupPersonalTone;
  personalSurface?: "discord" | null;
  emailTone?: CleanupEmailTone;
}): string {
  const userPromptBlocks = getCleanupPromptConfig().userPromptBlocks;
  switch (options.destination) {
    case "personal":
      switch (options.personalTone ?? DEFAULT_CLEANUP_PERSONAL_TONE) {
        case "very_casual":
          return userPromptBlocks.personalVeryCasual;
        case "casual":
          return options.personalSurface === "discord"
            ? userPromptBlocks.personalCasualDiscord
            : userPromptBlocks.personalCasualDefault;
        default:
          return "";
      }
    case "email":
      if ((options.emailTone ?? DEFAULT_CLEANUP_EMAIL_TONE) === "off")
        return "";
      return userPromptBlocks.email;
    default:
      return "";
  }
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
  const presets = getCleanupPromptConfig().presets;
  if (intensity === "custom") {
    const trimmed = customPrompt?.trim();
    return trimmed ? trimmed : presets.low;
  }
  return presets[intensity];
}

export function buildRewritePrompt(
  inputText: string,
  options?: {
    language?: string;
    intensity?: CleanupIntensity;
    customPrompt?: string;
    destination?: CleanupToneDestination;
    personalTone?: CleanupPersonalTone;
    personalSurface?: "discord" | null;
    workTone?: CleanupWorkTone;
    emailTone?: CleanupEmailTone;
    overallTone?: CleanupOverallTone;
  },
): { system: string; prompt: string } {
  const languageBlock = buildLanguageBlock(options?.language);
  const destinationBlock = buildDestinationToneBlock({
    destination: options?.destination ?? "overall",
    personalTone: options?.personalTone,
    personalSurface: options?.personalSurface,
    workTone: options?.workTone,
    emailTone: options?.emailTone,
    overallTone: options?.overallTone,
  });
  const destinationUserPromptBlock = buildDestinationUserPromptBlock({
    destination: options?.destination ?? "overall",
    personalTone: options?.personalTone,
    personalSurface: options?.personalSurface,
    emailTone: options?.emailTone,
  });
  const baseSystem = resolveBaseCleanupPrompt(
    options?.intensity ?? DEFAULT_CLEANUP_INTENSITY,
    options?.customPrompt,
  );

  return {
    system: baseSystem + languageBlock + destinationBlock,
    prompt: `${getCleanupPromptConfig().transcriptEditUserPrompt}${destinationUserPromptBlock}\n\n<transcript>\n${inputText}\n</transcript>`,
  };
}
