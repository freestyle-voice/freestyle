export interface LanguageOption {
  id: string;
  label: string;
  nativeLabel: string;
  onboarding?: boolean;
}

export const LANGUAGES: LanguageOption[] = [
  { id: "en", label: "English", nativeLabel: "English", onboarding: true },
  { id: "es", label: "Spanish", nativeLabel: "Español", onboarding: true },
  { id: "fr", label: "French", nativeLabel: "Français", onboarding: true },
  { id: "de", label: "German", nativeLabel: "Deutsch", onboarding: true },
  { id: "it", label: "Italian", nativeLabel: "Italiano", onboarding: true },
  { id: "pt", label: "Portuguese", nativeLabel: "Português", onboarding: true },
  { id: "nl", label: "Dutch", nativeLabel: "Nederlands", onboarding: true },
  { id: "ru", label: "Russian", nativeLabel: "Русский", onboarding: true },
  { id: "zh", label: "Chinese", nativeLabel: "中文", onboarding: true },
  { id: "ja", label: "Japanese", nativeLabel: "日本語", onboarding: true },
  { id: "ko", label: "Korean", nativeLabel: "한국어", onboarding: true },
  { id: "ar", label: "Arabic", nativeLabel: "العربية" },
  { id: "hi", label: "Hindi", nativeLabel: "हिन्दी", onboarding: true },
  { id: "pl", label: "Polish", nativeLabel: "Polski" },
  { id: "tr", label: "Turkish", nativeLabel: "Türkçe" },
  { id: "sv", label: "Swedish", nativeLabel: "Svenska" },
  { id: "da", label: "Danish", nativeLabel: "Dansk" },
  { id: "no", label: "Norwegian", nativeLabel: "Norsk" },
  { id: "fi", label: "Finnish", nativeLabel: "Suomi" },
  { id: "uk", label: "Ukrainian", nativeLabel: "Українська" },
];

export const ONBOARDING_LANGUAGES: LanguageOption[] = LANGUAGES.filter(
  (l) => l.onboarding,
);

export function defaultLanguage(): string {
  const code = (navigator.language || "en").slice(0, 2).toLowerCase();
  return ONBOARDING_LANGUAGES.some((l) => l.id === code) ? code : "auto";
}
