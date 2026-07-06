/**
 * User-facing dictation preferences (language + cleanup + tone), persisted
 * locally.
 */

import { useCallback, useEffect, useState } from "react";

import {
  type CleanupOverallTone,
  type CleanupTones,
  DEFAULT_OVERALL_TONE,
  DEFAULT_TONES,
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
const OVERALL_TONE_KEY = "overall_tone";

export interface DictationSettings {
  language: LanguageCode;
  cleanup: boolean;
  /** The user-facing tone dial. Surface tones ride along at defaults. */
  overallTone: CleanupOverallTone;
}

const DEFAULTS: DictationSettings = {
  language: "auto",
  cleanup: true,
  overallTone: DEFAULT_OVERALL_TONE,
};

/** Load and persist dictation settings. `ready` gates UI until the load lands. */
export function useSettings() {
  const [settings, setSettings] = useState<DictationSettings>(DEFAULTS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const [lang, cleanup, overallTone] = await Promise.all([
        getPref(LANGUAGE_KEY),
        getPref(CLEANUP_KEY),
        getPref(OVERALL_TONE_KEY),
      ]);
      setSettings({
        language: (lang as LanguageCode) ?? DEFAULTS.language,
        cleanup: cleanup == null ? DEFAULTS.cleanup : cleanup === "true",
        overallTone:
          (overallTone as CleanupOverallTone) ?? DEFAULTS.overallTone,
      });
      setReady(true);
    })();
  }, []);

  const setLanguage = useCallback((language: LanguageCode) => {
    setSettings((s) => ({ ...s, language }));
    void setPref(LANGUAGE_KEY, language);
  }, []);

  const setCleanup = useCallback((cleanup: boolean) => {
    setSettings((s) => ({ ...s, cleanup }));
    void setPref(CLEANUP_KEY, String(cleanup));
  }, []);

  const setOverallTone = useCallback((overallTone: CleanupOverallTone) => {
    setSettings((s) => ({ ...s, overallTone }));
    void setPref(OVERALL_TONE_KEY, overallTone);
  }, []);

  return { settings, ready, setLanguage, setCleanup, setOverallTone };
}

/** Convert an app language code to the cloud's hint (drops "auto"). */
export function languageHint(code: LanguageCode): string | undefined {
  return code === "auto" ? undefined : code;
}

/**
 * The full tone set to send to the cloud: the user's chosen overall tone plus
 * the surface-specific defaults, so the cloud always has a complete picture for
 * post-processing (streaming and batch).
 */
export function tonesForCloud(settings: DictationSettings): CleanupTones {
  return { ...DEFAULT_TONES, overallTone: settings.overallTone };
}
