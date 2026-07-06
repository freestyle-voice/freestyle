/**
 * Cleanup tone options + defaults for the mobile app.
 *
 * These mirror `@freestyle-voice/validations`'s `cleanup-tones` (the values the
 * cloud validates and applies during post-processing). They're duplicated
 * locally — rather than depending on the workspace package — to keep the Expo
 * bundle lean and avoid pulling `zod` through Metro. Keep in sync with the
 * validations package if the enums change.
 */

export type CleanupPersonalTone = "polished" | "casual" | "very_casual";
export type CleanupWorkTone = "direct" | "friendly" | "formal";
export type CleanupEmailTone = "casual" | "warm" | "formal";
export type CleanupOverallTone = "casual" | "neutral" | "professional";
export type CleanupIntensity = "low" | "medium" | "high" | "custom";

export const DEFAULT_PERSONAL_TONE: CleanupPersonalTone = "casual";
export const DEFAULT_WORK_TONE: CleanupWorkTone = "friendly";
export const DEFAULT_EMAIL_TONE: CleanupEmailTone = "warm";
export const DEFAULT_OVERALL_TONE: CleanupOverallTone = "neutral";
export const DEFAULT_INTENSITY: CleanupIntensity = "low";

/**
 * Full tone selection sent to the cloud so streaming and batch post-processing
 * behave like the desktop. Mobile keeps a single user-facing "overall tone"
 * dial for now; the surface-specific tones (personal/work/email) ride along at
 * their defaults so the cloud always has a complete picture.
 */
export interface CleanupTones {
  personalTone: CleanupPersonalTone;
  workTone: CleanupWorkTone;
  emailTone: CleanupEmailTone;
  overallTone: CleanupOverallTone;
}

export const DEFAULT_TONES: CleanupTones = {
  personalTone: DEFAULT_PERSONAL_TONE,
  workTone: DEFAULT_WORK_TONE,
  emailTone: DEFAULT_EMAIL_TONE,
  overallTone: DEFAULT_OVERALL_TONE,
};

export const OVERALL_TONE_OPTIONS: {
  value: CleanupOverallTone;
  label: string;
}[] = [
  { value: "casual", label: "Casual" },
  { value: "neutral", label: "Neutral" },
  { value: "professional", label: "Professional" },
];
