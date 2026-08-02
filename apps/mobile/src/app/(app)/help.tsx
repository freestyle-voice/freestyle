import Constants from "expo-constants";
import type { LucideIcon } from "lucide-react-native";
import {
  Bug,
  ChevronRight,
  ExternalLink,
  HeartHandshake,
  MessageCircle,
} from "lucide-react-native";
import { Linking, Pressable, StyleSheet, View } from "react-native";

import {
  Card,
  SectionTitle,
  SettingsScreenScaffold,
} from "@/components/settings-ui";
import { ThemedText } from "@/components/themed-text";
import { Fonts, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { LINKS } from "@/lib/links";

const APP_VERSION =
  Constants.expoConfig?.version ?? Constants.nativeAppVersion ?? "0.0.0";

export default function HelpScreen() {
  const theme = useTheme();

  return (
    <SettingsScreenScaffold
      title="Help"
      subtitle="Report a bug, ask the community, or contribute to Freestyle."
    >
      <Card style={styles.navCard}>
        <HelpRow
          icon={Bug}
          label="Report an issue"
          value="Open a GitHub issue"
          onPress={() => void Linking.openURL(LINKS.newIssue)}
        />
        <HelpRow
          icon={MessageCircle}
          label="Ask the community"
          value="Join the Discord"
          onPress={() => void Linking.openURL(LINKS.discord)}
        />
        <HelpRow
          icon={HeartHandshake}
          label="Contribute"
          value="Read the contributing guide"
          onPress={() => void Linking.openURL(LINKS.contributing)}
          last
        />
      </Card>

      <Card>
        <SectionTitle icon={ExternalLink} title="About" />
        <View style={styles.aboutRow}>
          <ThemedText style={styles.aboutLabel}>Version</ThemedText>
          <ThemedText themeColor="mutedForeground" style={styles.aboutValue}>
            {APP_VERSION}
          </ThemedText>
        </View>
        <Pressable
          onPress={() => void Linking.openURL(LINKS.repo)}
          style={({ pressed }) => [
            styles.aboutRow,
            pressed && { opacity: 0.6 },
          ]}
          accessibilityRole="link"
          accessibilityLabel="Open Freestyle on GitHub"
        >
          <ThemedText style={styles.aboutLabel}>Source</ThemedText>
          <View style={styles.sourceLink}>
            <ThemedText style={[styles.aboutValue, { color: theme.primary }]}>
              GitHub
            </ThemedText>
            <ChevronRight color={theme.primary} size={16} />
          </View>
        </Pressable>
      </Card>
    </SettingsScreenScaffold>
  );
}

function HelpRow({
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
      accessibilityRole="link"
      accessibilityLabel={label}
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
  aboutRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  aboutLabel: { fontFamily: Fonts.sansMedium, fontSize: 15 },
  aboutValue: { fontFamily: Fonts.mono, fontSize: 13 },
  sourceLink: { flexDirection: "row", alignItems: "center", gap: 2 },
});
