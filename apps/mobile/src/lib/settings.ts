/**
 * User-facing dictation preferences (language + cleanup), persisted locally.
 */

import { useCallback, useEffect, useState } from "react";

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

export interface DictationSettings {
  language: LanguageCode;
  cleanup: boolean;
}

const DEFAULTS: DictationSettings = { language: "auto", cleanup: true };

/** Load and persist dictation settings. `ready` gates UI until the load lands. */
export function useSettings() {
  const [settings, setSettings] = useState<DictationSettings>(DEFAULTS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const [lang, cleanup] = await Promise.all([
        getPref(LANGUAGE_KEY),
        getPref(CLEANUP_KEY),
      ]);
      setSettings({
        language: (lang as LanguageCode) ?? DEFAULTS.language,
        cleanup: cleanup == null ? DEFAULTS.cleanup : cleanup === "true",
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

  return { settings, ready, setLanguage, setCleanup };
}

/** Convert an app language code to the cloud's hint (drops "auto"). */
export function languageHint(code: LanguageCode): string | undefined {
  return code === "auto" ? undefined : code;
}
