import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import type { LucideIcon } from "lucide-react-native";
import {
  CircleQuestionMark,
  Globe,
  Keyboard,
  Languages,
  Monitor,
  Moon,
  Shield,
  Sun,
  Trash2,
  Volume2,
} from "lucide-react-native";
import { Alert, Pressable, StyleSheet, View } from "react-native";

import { LanguagePills } from "@/components/language-pills";
import {
  Card,
  OptionCard,
  SectionTitle,
  SettingsNavRow,
  SettingsScreenScaffold,
} from "@/components/settings-ui";
import { ThemedText } from "@/components/themed-text";
import { Fonts, Radius, Spacing } from "@/constants/theme";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/hooks/use-theme";
import { fetchCloudConfig } from "@/lib/cloud/cloud-config";
import { type ColorModePreference, useColorMode } from "@/lib/color-mode";
import { type HistoryRetentionDays, useHistory } from "@/lib/history";
import { confirmClearHistory } from "@/lib/history-alerts";
import { useSettings } from "@/lib/settings";

const APPEARANCE: {
  value: ColorModePreference;
  label: string;
  icon: LucideIcon;
}[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "system", label: "System", icon: Monitor },
  { value: "dark", label: "Dark", icon: Moon },
];

const RETENTION: { value: HistoryRetentionDays; label: string }[] = [
  { value: "never", label: "Never" },
  { value: 7, label: "7 days" },
  { value: 30, label: "30 days" },
];

export default function SettingsScreen() {
  const theme = useTheme();
  const router = useRouter();
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

  // Region-based suggested languages from the cloud, to order the picker.
  const { data: cloudConfig } = useQuery({
    queryKey: ["cloud-config"],
    queryFn: () => fetchCloudConfig(),
    enabled: signedIn,
    staleTime: 6 * 60 * 60 * 1000,
    retry: 1,
  });

  const translateAvailable = settings.languages.length === 1;

  const selectRetention = (days: HistoryRetentionDays) => {
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

  return (
    <SettingsScreenScaffold title="Settings">
      <Card>
        <SectionTitle icon={Globe} title="Language" />
        <ThemedText themeColor="mutedForeground" style={styles.languageHint}>
          Pick the languages you speak, or leave empty to auto-detect.
        </ThemedText>
        <LanguagePills
          values={settings.languages}
          onChange={setLanguages}
          suggestedLanguages={cloudConfig?.suggestedLanguages}
        />
        <SectionTitle icon={Languages} title="Translate" />
        <ThemedText themeColor="mutedForeground" style={styles.sectionHint}>
          {translateAvailable
            ? "Translate spoken words into your selected language."
            : "Select exactly one language above to enable translate mode."}
        </ThemedText>
        <OptionCard
          label="Translate to my language"
          hint="Cloud translates into the language you picked."
          selected={settings.translate && translateAvailable}
          disabled={!translateAvailable}
          onPress={() => setTranslate(true)}
        />
        <OptionCard
          label="Keep original language"
          hint="Transcribe in whatever language was spoken."
          selected={!settings.translate || !translateAvailable}
          onPress={() => setTranslate(false)}
        />
      </Card>

      <Card>
        <SectionTitle icon={Volume2} title="Sound feedback" />
        <OptionCard
          label="Chimes on"
          hint="Soft tones when recording starts and finishes."
          selected={settings.soundFeedback}
          onPress={() => setSoundFeedback(true)}
        />
        <OptionCard
          label="Chimes off"
          hint="Haptics only — no audio cues."
          selected={!settings.soundFeedback}
          onPress={() => setSoundFeedback(false)}
        />
      </Card>

      <Card style={styles.navCard}>
        <SettingsNavRow
          icon={Keyboard}
          label="Voice keyboard"
          value="Dictate in any app"
          onPress={() => router.push("/(app)/keyboard-setup")}
        />
        <SettingsNavRow
          icon={CircleQuestionMark}
          label="Help"
          value="Issues, Discord, contribute"
          onPress={() => router.push("/(app)/help")}
          last
        />
      </Card>

      <Card>
        <SectionTitle icon={Monitor} title="Appearance" />
        <View
          style={[styles.toggleTrack, { backgroundColor: theme.secondary }]}
        >
          {APPEARANCE.map((opt) => {
            const active = preference === opt.value;
            const Icon = opt.icon;
            return (
              <Pressable
                key={opt.value}
                onPress={() => setPreference(opt.value)}
                accessibilityRole="button"
                accessibilityLabel={opt.label}
                accessibilityState={active ? { selected: true } : {}}
                style={[
                  styles.toggleItem,
                  active && {
                    backgroundColor: theme.card,
                    borderColor: theme.border,
                  },
                ]}
              >
                <Icon
                  color={active ? theme.foreground : theme.mutedForeground}
                  size={18}
                />
              </Pressable>
            );
          })}
        </View>
      </Card>

      <Card>
        <SectionTitle icon={Shield} title="Data & privacy" />
        <ThemedText themeColor="mutedForeground" style={styles.sectionHint}>
          History stays on this device. Pause saving or auto-delete older
          entries anytime.
        </ThemedText>
        <OptionCard
          label="Save dictations"
          hint="New transcripts are kept in History."
          selected={!pauseHistory}
          disabled={!historyReady}
          onPress={() => setPauseHistory(false)}
        />
        <OptionCard
          label="Pause history"
          hint="Keep existing entries; don't save new ones."
          selected={pauseHistory}
          disabled={!historyReady}
          onPress={() => setPauseHistory(true)}
        />

        <ThemedText themeColor="mutedForeground" style={styles.retentionLabel}>
          Auto-delete
        </ThemedText>
        <View
          style={[styles.toggleTrack, { backgroundColor: theme.secondary }]}
        >
          {RETENTION.map((opt) => {
            const active = historyRetentionDays === opt.value;
            return (
              <Pressable
                key={String(opt.value)}
                onPress={() => selectRetention(opt.value)}
                disabled={!historyReady}
                accessibilityRole="radio"
                accessibilityLabel={opt.label}
                accessibilityState={{
                  selected: active,
                  disabled: !historyReady,
                }}
                style={[
                  styles.toggleItem,
                  { opacity: historyReady ? 1 : 0.45 },
                  active && {
                    backgroundColor: theme.card,
                    borderColor: theme.border,
                  },
                ]}
              >
                <ThemedText
                  style={[
                    styles.retentionOption,
                    {
                      color: active ? theme.foreground : theme.mutedForeground,
                    },
                  ]}
                >
                  {opt.label}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>

        <Pressable
          onPress={() => confirmClearHistory(clearHistory)}
          disabled={history.length === 0}
          style={({ pressed }) => [
            styles.clearRow,
            {
              borderColor: theme.border,
              opacity: history.length === 0 ? 0.4 : pressed ? 0.6 : 1,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Clear history"
        >
          <Trash2 color={theme.destructive} size={18} />
          <ThemedText style={[styles.clearLabel, { color: theme.destructive }]}>
            Clear history
          </ThemedText>
          <ThemedText themeColor="mutedForeground" style={styles.clearCount}>
            {history.length === 0
              ? "Empty"
              : `${history.length} on this device`}
          </ThemedText>
        </Pressable>
      </Card>
    </SettingsScreenScaffold>
  );
}

const styles = StyleSheet.create({
  languageHint: {
    fontSize: 13,
    marginBottom: Spacing.three,
    marginTop: -Spacing.one,
  },
  sectionHint: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: -Spacing.one,
  },
  retentionLabel: {
    fontFamily: Fonts.mono,
    fontSize: 10,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginTop: Spacing.one,
  },
  retentionOption: {
    fontFamily: Fonts.sansMedium,
    fontSize: 13,
  },
  clearRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    paddingVertical: Spacing.three - 2,
    paddingHorizontal: Spacing.three,
    borderWidth: 1,
    borderRadius: Radius.lg,
    marginTop: Spacing.one,
  },
  clearLabel: { fontFamily: Fonts.sansMedium, fontSize: 15, flex: 1 },
  clearCount: { fontSize: 12 },
  navCard: { gap: 0, paddingVertical: Spacing.one },
  toggleTrack: {
    flexDirection: "row",
    borderRadius: Radius.lg,
    padding: 3,
  },
  toggleItem: {
    minHeight: 44,
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.two + 2,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: "transparent",
  },
});
