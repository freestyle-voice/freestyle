/**
 * Cleanup tone options + defaults for the mobile app.
 *
 * These mirror `@freestyle-voice/validations`'s `cleanup-tones` (the values the
 * cloud validates and applies during post-processing). They're duplicated
 * locally — rather than depending on the workspace package — to keep the Expo
 * bundle lean and avoid pulling `zod` through Metro. Keep in sync with the
 * validations package if the enums change.
 */

export type CleanupPersonalTone = "polished" | "casual" | "very_casual" | "off";
export type CleanupWorkTone = "direct" | "friendly" | "formal" | "off";
export type CleanupEmailTone = "casual" | "warm" | "formal" | "off";
export type CleanupOverallTone = "casual" | "neutral" | "professional" | "off";
export type CleanupIntensity = "low" | "medium" | "high" | "custom";

// Defaults mirror the desktop app: every surface tone starts "off" and rides
// along until the user dials it in; intensity seeds at "medium".
export const DEFAULT_PERSONAL_TONE: CleanupPersonalTone = "off";
export const DEFAULT_WORK_TONE: CleanupWorkTone = "off";
export const DEFAULT_EMAIL_TONE: CleanupEmailTone = "off";
export const DEFAULT_OVERALL_TONE: CleanupOverallTone = "neutral";
export const DEFAULT_INTENSITY: CleanupIntensity = "medium";

/**
 * Full tone selection sent to the cloud so streaming and batch post-processing
 * behave like the desktop.
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

export interface ToneOption<T> {
  value: T;
  label: string;
  hint: string;
}

const OFF_HINT = "Leave this destination untouched.";

export const INTENSITY_OPTIONS: ToneOption<CleanupIntensity>[] = [
  { value: "low", label: "Light", hint: "Fix punctuation, keep my wording." },
  {
    value: "medium",
    label: "Balanced",
    hint: "Remove filler and tidy grammar.",
  },
  {
    value: "high",
    label: "Polished",
    hint: "Rewrite for clarity and flow.",
  },
  {
    value: "custom",
    label: "Custom",
    hint: "Write your own cleanup instructions.",
  },
];

export const PERSONAL_TONE_OPTIONS: ToneOption<CleanupPersonalTone>[] = [
  { value: "polished", label: "Polished", hint: "Clean but still personal." },
  { value: "casual", label: "Casual", hint: "Relaxed, everyday voice." },
  {
    value: "very_casual",
    label: "Very casual",
    hint: "Loose, texting-style.",
  },
  { value: "off", label: "Off", hint: OFF_HINT },
];

export const WORK_TONE_OPTIONS: ToneOption<CleanupWorkTone>[] = [
  { value: "direct", label: "Direct", hint: "Concise and to the point." },
  { value: "friendly", label: "Friendly", hint: "Warm but professional." },
  { value: "formal", label: "Formal", hint: "Buttoned-up and precise." },
  { value: "off", label: "Off", hint: OFF_HINT },
];

export const EMAIL_TONE_OPTIONS: ToneOption<CleanupEmailTone>[] = [
  { value: "casual", label: "Casual", hint: "Quick, breezy emails." },
  { value: "warm", label: "Warm", hint: "Friendly and considerate." },
  { value: "formal", label: "Formal", hint: "Polished correspondence." },
  { value: "off", label: "Off", hint: OFF_HINT },
];

export const OVERALL_TONE_OPTIONS: ToneOption<CleanupOverallTone>[] = [
  { value: "casual", label: "Casual", hint: "Relaxed everywhere else." },
  { value: "neutral", label: "Neutral", hint: "Balanced, natural voice." },
  {
    value: "professional",
    label: "Professional",
    hint: "Clean and composed.",
  },
  { value: "off", label: "Off", hint: OFF_HINT },
];
