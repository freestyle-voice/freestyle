/**
 * User-facing dictation preferences (language + cleanup + all tone dials),
 * persisted locally and shared across the app via a context provider so every
 * settings sub-page reads and writes the same source of truth.
 */

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  type CleanupEmailTone,
  type CleanupIntensity,
  type CleanupOverallTone,
  type CleanupPersonalTone,
  type CleanupTones,
  type CleanupWorkTone,
  DEFAULT_EMAIL_TONE,
  DEFAULT_INTENSITY,
  DEFAULT_OVERALL_TONE,
  DEFAULT_PERSONAL_TONE,
  DEFAULT_WORK_TONE,
} from "./cleanup-tones";
import { getPref, setPref } from "./storage";

export const LANGUAGES = [
  { code: "auto", name: "Auto detect" },
  { code: "en", name: "English" },
  { code: "es", name: "Spanish" },
  { code: "fr", name: "French" },
  { code: "de", name: "German" },
  { code: "it", name: "Italian" },
  { code: "pt", name: "Portuguese" },
  { code: "nl", name: "Dutch" },
  { code: "ja", name: "Japanese" },
  { code: "ko", name: "Korean" },
  { code: "zh", name: "Chinese" },
  { code: "hi", name: "Hindi" },
  { code: "ru", name: "Russian" },
  { code: "ar", name: "Arabic" },
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]["code"];

const LANGUAGE_KEY = "language";
const CLEANUP_KEY = "cleanup";
const INTENSITY_KEY = "cleanup_intensity";
const CUSTOM_PROMPT_KEY = "cleanup_custom_prompt";
const PERSONAL_TONE_KEY = "cleanup_personal_tone";
const WORK_TONE_KEY = "cleanup_work_tone";
const EMAIL_TONE_KEY = "cleanup_email_tone";
const OVERALL_TONE_KEY = "cleanup_overall_tone";

export interface DictationSettings {
  language: LanguageCode;
  cleanup: boolean;
  intensity: CleanupIntensity;
  customPrompt: string;
  personalTone: CleanupPersonalTone;
  workTone: CleanupWorkTone;
  emailTone: CleanupEmailTone;
  overallTone: CleanupOverallTone;
}

const DEFAULTS: DictationSettings = {
  language: "auto",
  cleanup: true,
  intensity: DEFAULT_INTENSITY,
  customPrompt: "",
  personalTone: DEFAULT_PERSONAL_TONE,
  workTone: DEFAULT_WORK_TONE,
  emailTone: DEFAULT_EMAIL_TONE,
  overallTone: DEFAULT_OVERALL_TONE,
};

interface SettingsContextValue {
  settings: DictationSettings;
  ready: boolean;
  setLanguage: (language: LanguageCode) => void;
  setCleanup: (cleanup: boolean) => void;
  setIntensity: (intensity: CleanupIntensity) => void;
  setCustomPrompt: (prompt: string) => void;
  setPersonalTone: (tone: CleanupPersonalTone) => void;
  setWorkTone: (tone: CleanupWorkTone) => void;
  setEmailTone: (tone: CleanupEmailTone) => void;
  setOverallTone: (tone: CleanupOverallTone) => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<DictationSettings>(DEFAULTS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const [
        lang,
        cleanup,
        intensity,
        customPrompt,
        personalTone,
        workTone,
        emailTone,
        overallTone,
      ] = await Promise.all([
        getPref(LANGUAGE_KEY),
        getPref(CLEANUP_KEY),
        getPref(INTENSITY_KEY),
        getPref(CUSTOM_PROMPT_KEY),
        getPref(PERSONAL_TONE_KEY),
        getPref(WORK_TONE_KEY),
        getPref(EMAIL_TONE_KEY),
        getPref(OVERALL_TONE_KEY),
      ]);
      setSettings({
        language: (lang as LanguageCode) ?? DEFAULTS.language,
        cleanup: cleanup == null ? DEFAULTS.cleanup : cleanup === "true",
        intensity: (intensity as CleanupIntensity) ?? DEFAULTS.intensity,
        customPrompt: customPrompt ?? DEFAULTS.customPrompt,
        personalTone:
          (personalTone as CleanupPersonalTone) ?? DEFAULTS.personalTone,
        workTone: (workTone as CleanupWorkTone) ?? DEFAULTS.workTone,
        emailTone: (emailTone as CleanupEmailTone) ?? DEFAULTS.emailTone,
        overallTone:
          (overallTone as CleanupOverallTone) ?? DEFAULTS.overallTone,
      });
      setReady(true);
    })();
  }, []);

  const persist = useCallback(
    <K extends keyof DictationSettings>(
      storageKey: string,
      field: K,
      value: DictationSettings[K],
    ) => {
      setSettings((s) => ({ ...s, [field]: value }));
      void setPref(storageKey, String(value));
    },
    [],
  );

  const value = useMemo<SettingsContextValue>(
    () => ({
      settings,
      ready,
      setLanguage: (language) => persist(LANGUAGE_KEY, "language", language),
      setCleanup: (cleanup) => persist(CLEANUP_KEY, "cleanup", cleanup),
      setIntensity: (intensity) =>
        persist(INTENSITY_KEY, "intensity", intensity),
      setCustomPrompt: (prompt) =>
        persist(CUSTOM_PROMPT_KEY, "customPrompt", prompt),
      setPersonalTone: (tone) =>
        persist(PERSONAL_TONE_KEY, "personalTone", tone),
      setWorkTone: (tone) => persist(WORK_TONE_KEY, "workTone", tone),
      setEmailTone: (tone) => persist(EMAIL_TONE_KEY, "emailTone", tone),
      setOverallTone: (tone) => persist(OVERALL_TONE_KEY, "overallTone", tone),
    }),
    [settings, ready, persist],
  );

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

/** Access dictation settings. Must be used under a `SettingsProvider`. */
export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) {
    throw new Error("useSettings must be used within a SettingsProvider");
  }
  return ctx;
}

/** Convert an app language code to the cloud's hint (drops "auto"). */
export function languageHint(code: LanguageCode): string | undefined {
  return code === "auto" ? undefined : code;
}

/**
 * The full tone set to send to the cloud, straight from the user's dials. Any
 * dial left "off" tells the cloud to leave that destination untouched.
 */
export function tonesForCloud(settings: DictationSettings): CleanupTones {
  return {
    personalTone: settings.personalTone,
    workTone: settings.workTone,
    emailTone: settings.emailTone,
    overallTone: settings.overallTone,
  };
}
