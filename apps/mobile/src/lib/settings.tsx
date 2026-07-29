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
import {
  fetchCloudPreferences,
  pushCloudPreferences,
} from "./cloud/preferences";
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

/**
 * Which `DictationSettings` fields sync to the cloud, and the cloud preference
 * field each maps to. `language` and `cleanup` are local-only concerns
 * (`cleanup` is an app toggle; `language` maps to the cloud `language` field).
 */
const CLOUD_FIELD_MAP: {
  [K in keyof DictationSettings]?:
    | "intensity"
    | "customPrompt"
    | "personalTone"
    | "workTone"
    | "emailTone"
    | "overallTone"
    | "language";
} = {
  intensity: "intensity",
  customPrompt: "customPrompt",
  personalTone: "personalTone",
  workTone: "workTone",
  emailTone: "emailTone",
  overallTone: "overallTone",
  language: "language",
};

/**
 * Fetch the cloud preferences snapshot and mirror it into AsyncStorage,
 * returning the patch to merge into local state. Returns null when signed out /
 * offline / no snapshot, so the caller keeps the local settings as-is. Never
 * throws.
 */
async function hydrateSettingsFromCloud(): Promise<Partial<DictationSettings> | null> {
  let remote: Awaited<ReturnType<typeof fetchCloudPreferences>>;
  try {
    remote = await fetchCloudPreferences();
  } catch {
    return null; // signed out / offline / no org — keep local settings.
  }

  const next: Partial<DictationSettings> = {};
  const writes: Promise<void>[] = [];
  const apply = <K extends keyof DictationSettings>(
    field: K,
    storageKey: string,
    value: DictationSettings[K] | null | undefined,
  ): void => {
    if (value === undefined || value === null) return;
    next[field] = value;
    writes.push(setPref(storageKey, String(value)));
  };

  apply("intensity", INTENSITY_KEY, remote.intensity ?? undefined);
  apply("customPrompt", CUSTOM_PROMPT_KEY, remote.customPrompt ?? undefined);
  apply("personalTone", PERSONAL_TONE_KEY, remote.personalTone ?? undefined);
  apply("workTone", WORK_TONE_KEY, remote.workTone ?? undefined);
  apply("emailTone", EMAIL_TONE_KEY, remote.emailTone ?? undefined);
  apply("overallTone", OVERALL_TONE_KEY, remote.overallTone ?? undefined);
  apply(
    "language",
    LANGUAGE_KEY,
    (remote.language as LanguageCode) ?? undefined,
  );

  if (Object.keys(next).length === 0) return null;
  await Promise.all(writes).catch(() => {});
  return next;
}

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

      // Seed from the cloud snapshot when signed in (cross-device sync). The
      // cloud is the cross-device seed; a value present upstream overwrites the
      // local one and is mirrored back into AsyncStorage. No-op / swallowed
      // when signed out or offline.
      const patch = await hydrateSettingsFromCloud();
      if (patch) setSettings((s) => ({ ...s, ...patch }));
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

      // Mirror the change to the cloud (fire-and-forget; swallowed on failure
      // so a sync error never affects the local write).
      const cloudField = CLOUD_FIELD_MAP[field];
      if (cloudField) {
        void pushCloudPreferences({ [cloudField]: value }).catch(() => {});
      }
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
