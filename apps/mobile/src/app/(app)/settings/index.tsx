import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import {
  BookOpen,
  CircleQuestionMark,
  Globe,
  Keyboard,
  Languages,
  Monitor,
  Replace,
  Shield,
  Sparkles,
  Trash2,
  Volume2,
} from "lucide-react-native";
import { useState } from "react";
import { Alert } from "react-native";

import { LanguageSheet } from "@/components/language-sheet";
import { SelectSheet } from "@/components/select-sheet";
import {
  SettingsGroup,
  SettingsNavRow,
  SettingsScreenScaffold,
  SettingsToggleRow,
  SettingsValueRow,
} from "@/components/settings-ui";
import { useAuth } from "@/hooks/use-auth";
import { fetchCloudConfig } from "@/lib/cloud/cloud-config";
import { type ColorModePreference, useColorMode } from "@/lib/color-mode";
import { type HistoryRetentionDays, useHistory } from "@/lib/history";
import { confirmClearHistory } from "@/lib/history-alerts";
import { LANGUAGES, useSettings } from "@/lib/settings";

const APPEARANCE: { value: ColorModePreference; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "system", label: "System" },
  { value: "dark", label: "Dark" },
];

const RETENTION: { value: HistoryRetentionDays; label: string }[] = [
  { value: "never", label: "Keep forever" },
  { value: 7, label: "7 days" },
  { value: 30, label: "30 days" },
];

function languageSummary(languages: string[]): string {
  if (languages.length === 0) return "Auto-detect";
  const first = LANGUAGES.find((language) => language.code === languages[0]);
  const firstLabel = first?.name ?? languages[0];
  return languages.length === 1
    ? firstLabel
    : `${firstLabel} +${languages.length - 1}`;
}

export default function SettingsScreen() {
  const router = useRouter();
  const [languageSheetOpen, setLanguageSheetOpen] = useState(false);
  const [translationSheetOpen, setTranslationSheetOpen] = useState(false);
  const [soundSheetOpen, setSoundSheetOpen] = useState(false);
  const [appearanceSheetOpen, setAppearanceSheetOpen] = useState(false);
  const [retentionSheetOpen, setRetentionSheetOpen] = useState(false);
  const { settings, setLanguages, setTranslate, setSoundFeedback } =
    useSettings();
  const {
    pauseHistory,
    historyRetentionDays,
    setPauseHistory,
    setHistoryRetentionDays,
    clearHistory,
    history,
    ready: historyReady,
  } = useHistory();
  const { signedIn } = useAuth();
  const { preference, setPreference } = useColorMode();

  const { data: cloudConfig } = useQuery({
    queryKey: ["cloud-config"],
    queryFn: () => fetchCloudConfig(),
    enabled: signedIn,
    staleTime: 6 * 60 * 60 * 1000,
    retry: 1,
  });

  const translateAvailable = settings.languages.length === 1;
  const spokenLanguage = languageSummary(settings.languages);
  const translationValue = !translateAvailable
    ? "Choose one language"
    : settings.translate
      ? `To ${spokenLanguage}`
      : "Keep original";
  const retentionValue =
    RETENTION.find((option) => option.value === historyRetentionDays)?.label ??
    "Keep forever";

  const selectRetention = (days: HistoryRetentionDays) => {
    setRetentionSheetOpen(false);
    if (days === historyRetentionDays) return;
    const currentDays =
      historyRetentionDays === "never"
        ? Number.POSITIVE_INFINITY
        : historyRetentionDays;
    const nextDays = days === "never" ? Number.POSITIVE_INFINITY : days;
    if (nextDays >= currentDays || days === "never") {
      setHistoryRetentionDays(days);
      return;
    }
    const cutoff = Date.now() - days * 86_400_000;
    const deletionCount = history.filter(
      (entry) => entry.createdAt < cutoff,
    ).length;
    if (deletionCount === 0) {
      setHistoryRetentionDays(days);
      return;
    }
    Alert.alert(
      `Delete history older than ${days} days?`,
      `This will permanently remove ${deletionCount} ${
        deletionCount === 1 ? "dictation" : "dictations"
      } from this device.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => setHistoryRetentionDays(days),
        },
      ],
    );
  };

  const toggleLanguage = (code: string) => {
    if (settings.languages.includes(code)) {
      setLanguages(settings.languages.filter((language) => language !== code));
      return;
    }
    setLanguages([...settings.languages, code]);
  };

  return (
    <SettingsScreenScaffold
      title="Dictation"
      subtitle="Dictation preferences and privacy."
    >
      <SettingsGroup title="Speech">
        <SettingsValueRow
          icon={Globe}
          label="Languages"
          value={spokenLanguage}
          onPress={() => setLanguageSheetOpen(true)}
        />
        <SettingsValueRow
          icon={Languages}
          label="Translation"
          value={translationValue}
          onPress={() => setTranslationSheetOpen(true)}
          disabled={!translateAvailable}
        />
        <SettingsValueRow
          icon={Volume2}
          label="Recording feedback"
          value={settings.soundFeedback ? "Chimes" : "Haptics only"}
          onPress={() => setSoundSheetOpen(true)}
          last
        />
      </SettingsGroup>

      <SettingsGroup title="Writing">
        <SettingsNavRow
          icon={Sparkles}
          label="Cleanup & tone"
          value="Writing style"
          onPress={() => router.push("/(app)/tone")}
        />
        <SettingsNavRow
          icon={BookOpen}
          label="Words"
          value="Names & phrases"
          onPress={() => router.push("/(app)/vocabulary")}
        />
        <SettingsNavRow
          icon={Replace}
          label="Dictionary"
          value="Text replacements"
          onPress={() => router.push("/(app)/dictionary")}
        />
        <SettingsNavRow
          icon={Keyboard}
          label="Voice keyboard"
          value="Use in any app"
          onPress={() => router.push("/(app)/keyboard-setup")}
          last
        />
      </SettingsGroup>

      <SettingsGroup title="History & privacy">
        <SettingsToggleRow
          icon={Shield}
          label="Save dictations"
          hint="Save new transcripts to History."
          value={!pauseHistory}
          onValueChange={(enabled) => setPauseHistory(!enabled)}
          disabled={!historyReady}
        />
        <SettingsValueRow
          label="Keep history"
          value={retentionValue}
          onPress={() => setRetentionSheetOpen(true)}
          disabled={!historyReady}
        />
        <SettingsValueRow
          icon={Trash2}
          label="Clear history"
          value={
            history.length === 0 ? "Empty" : `${history.length} on this device`
          }
          onPress={() => confirmClearHistory(clearHistory)}
          disabled={history.length === 0}
          last
        />
      </SettingsGroup>

      <SettingsGroup title="Appearance">
        <SettingsValueRow
          icon={Monitor}
          label="Appearance"
          value={
            APPEARANCE.find((option) => option.value === preference)?.label ??
            "System"
          }
          onPress={() => setAppearanceSheetOpen(true)}
          last
        />
      </SettingsGroup>

      <SettingsGroup title="Support">
        <SettingsNavRow
          icon={CircleQuestionMark}
          label="Help"
          value="Help & feedback"
          onPress={() => router.push("/(app)/help")}
          last
        />
      </SettingsGroup>

      <LanguageSheet
        visible={languageSheetOpen}
        selected={settings.languages}
        onToggle={toggleLanguage}
        onClose={() => setLanguageSheetOpen(false)}
        suggestedLanguages={cloudConfig?.suggestedLanguages}
      />
      <SelectSheet
        visible={translationSheetOpen}
        title="Translation"
        options={[
          { value: "original", label: "Keep original language" },
          { value: "translate", label: `Translate to ${spokenLanguage}` },
        ]}
        selectedValue={settings.translate ? "translate" : "original"}
        onSelect={(value) => {
          setTranslate(value === "translate");
          setTranslationSheetOpen(false);
        }}
        onClose={() => setTranslationSheetOpen(false)}
      />
      <SelectSheet
        visible={soundSheetOpen}
        title="Recording feedback"
        options={[
          { value: "chimes", label: "Chimes" },
          { value: "haptics", label: "Haptics only" },
        ]}
        selectedValue={settings.soundFeedback ? "chimes" : "haptics"}
        onSelect={(value) => {
          setSoundFeedback(value === "chimes");
          setSoundSheetOpen(false);
        }}
        onClose={() => setSoundSheetOpen(false)}
      />
      <SelectSheet
        visible={retentionSheetOpen}
        title="Keep history"
        options={RETENTION.map((option) => ({
          value: String(option.value),
          label: option.label,
        }))}
        selectedValue={String(historyRetentionDays)}
        onSelect={(value) => {
          const option = RETENTION.find(
            (candidate) => String(candidate.value) === value,
          );
          if (option) selectRetention(option.value);
        }}
        onClose={() => setRetentionSheetOpen(false)}
      />
      <SelectSheet
        visible={appearanceSheetOpen}
        title="Appearance"
        options={APPEARANCE}
        selectedValue={preference}
        onSelect={(value) => {
          setPreference(value as ColorModePreference);
          setAppearanceSheetOpen(false);
        }}
        onClose={() => setAppearanceSheetOpen(false)}
      />
    </SettingsScreenScaffold>
  );
}
