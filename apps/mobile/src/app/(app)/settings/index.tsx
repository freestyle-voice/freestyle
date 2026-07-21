import { useRouter } from "expo-router";
import type { LucideIcon } from "lucide-react-native";
import {
  ChevronRight,
  Globe,
  Keyboard,
  Monitor,
  Moon,
  Sun,
} from "lucide-react-native";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { LanguageSheet } from "@/components/language-sheet";
import {
  Card,
  SectionTitle,
  SettingsScreenScaffold,
} from "@/components/settings-ui";
import { ThemedText } from "@/components/themed-text";
import { Fonts, Radius, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { type ColorModePreference, useColorMode } from "@/lib/color-mode";
import { LANGUAGES, useSettings } from "@/lib/settings";

const APPEARANCE: {
  value: ColorModePreference;
  label: string;
  icon: LucideIcon;
}[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "system", label: "System", icon: Monitor },
  { value: "dark", label: "Dark", icon: Moon },
];

export default function SettingsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { settings, setLanguage } = useSettings();
  const { preference, setPreference } = useColorMode();
  const [languageOpen, setLanguageOpen] = useState(false);

  const languageName = useMemo(
    () =>
      LANGUAGES.find((l) => l.code === settings.language)?.name ??
      "Auto detect",
    [settings.language],
  );

  return (
    <SettingsScreenScaffold title="Settings">
      <Card style={styles.navCard}>
        <NavRow
          icon={Globe}
          label="Language"
          value={languageName}
          onPress={() => setLanguageOpen(true)}
        />
        <NavRow
          icon={Keyboard}
          label="Voice keyboard"
          value="Dictate in any app"
          onPress={() => router.push("/(app)/keyboard-setup")}
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

      <LanguageSheet
        visible={languageOpen}
        selected={settings.language}
        onSelect={setLanguage}
        onClose={() => setLanguageOpen(false)}
      />
    </SettingsScreenScaffold>
  );
}

function NavRow({
  icon: Icon,
  label,
  value,
  onPress,
  last = false,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  onPress: () => void;
  last?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.navRow,
        !last && {
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: theme.border,
        },
        pressed && { opacity: 0.6 },
      ]}
    >
      <Icon color={theme.mutedForeground} size={20} />
      <View style={styles.navRowContent}>
        <ThemedText style={styles.navRowLabel}>{label}</ThemedText>
        <ThemedText themeColor="mutedForeground" style={styles.navRowValue}>
          {value}
        </ThemedText>
      </View>
      <ChevronRight color={theme.mutedForeground} size={18} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  navCard: { gap: 0, paddingVertical: Spacing.one },
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
    paddingVertical: Spacing.three - 2,
  },
  navRowContent: { flex: 1 },
  navRowLabel: { fontFamily: Fonts.sansMedium, fontSize: 15 },
  navRowValue: { fontSize: 13, marginTop: 1 },
  toggleTrack: {
    flexDirection: "row",
    borderRadius: Radius.lg,
    padding: 3,
  },
  toggleItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.two + 2,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: "transparent",
  },
});
