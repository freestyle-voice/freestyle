import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";

// Eagerly load all JSON translation files from the locales directory
const localeModules = import.meta.glob("./locales/*.json", {
  eager: true,
}) as Record<string, { default: Record<string, any> }>;

const resources: Record<string, { translation: Record<string, any> }> = {};
const supportedLanguages: string[] = [];

for (const path in localeModules) {
  const match = path.match(/\/locales\/([^/]+)\.json$/);
  if (match) {
    const lang = match[1];
    if (lang === "template") continue;
    resources[lang] = { translation: localeModules[path].default };
    supportedLanguages.push(lang);
  }
}

export const SUPPORTED_LANGUAGES = supportedLanguages;
export type SupportedLanguage = string;

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: "en",
    supportedLngs: SUPPORTED_LANGUAGES,
    detection: {
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
      lookupLocalStorage: "freestyle_ui_language",
    },
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
