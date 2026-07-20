import i18n, { type BackendModule, type Services } from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";

type LocaleResource = Record<string, unknown>;
type LocaleModule = { default: LocaleResource };

// Keep the language list available synchronously, but load translation content
// on demand so every locale is not bundled into the initial dashboard chunk.
const localeModules = import.meta.glob<LocaleModule>([
  "./locales/*.json",
  "!./locales/template.json",
]);

const localeLoaders: Record<string, () => Promise<LocaleModule>> = {};
const supportedLanguages: string[] = [];

for (const path in localeModules) {
  const match = path.match(/\/locales\/([^/]+)\.json$/);

  if (!match) continue;

  const lang = match[1];
  localeLoaders[lang] = localeModules[path];
  supportedLanguages.push(lang);
}

supportedLanguages.sort();

const localeBackend: BackendModule = {
  type: "backend",
  init(_services: Services): void {},
  async read(language, _namespace, callback): Promise<void> {
    const lang = supportedLanguages.includes(language) ? language : "en";
    const loader = localeLoaders[lang] ?? localeLoaders.en;

    if (!loader) {
      callback(new Error(`No locale loader found for ${lang}`), null);
      return;
    }

    try {
      const module = await loader();
      callback(null, module.default);
    } catch (err) {
      callback(err instanceof Error ? err : new Error(String(err)), null);
    }
  },
};

export const SUPPORTED_LANGUAGES = supportedLanguages;
export type SupportedLanguage = string;

export async function initI18n(): Promise<void> {
  if (i18n.isInitialized) return;

  await i18n
    .use(localeBackend)
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
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
      react: {
        useSuspense: false,
      },
    });
}

export default i18n;
