import Constants from "expo-constants";
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
  SettingsNavRow,
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
        <SettingsNavRow
          icon={Bug}
          label="Report an issue"
          value="Open a GitHub issue"
          onPress={() => void Linking.openURL(LINKS.newIssue)}
          accessibilityRole="link"
        />
        <SettingsNavRow
          icon={MessageCircle}
          label="Ask the community"
          value="Join the Discord"
          onPress={() => void Linking.openURL(LINKS.discord)}
          accessibilityRole="link"
        />
        <SettingsNavRow
          icon={HeartHandshake}
          label="Contribute"
          value="Read the contributing guide"
          onPress={() => void Linking.openURL(LINKS.contributing)}
          last
          accessibilityRole="link"
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

const styles = StyleSheet.create({
  navCard: { gap: 0, paddingVertical: Spacing.one },
  aboutRow: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  aboutLabel: { fontFamily: Fonts.sansMedium, fontSize: 15 },
  aboutValue: { fontFamily: Fonts.mono, fontSize: 13 },
  sourceLink: { flexDirection: "row", alignItems: "center", gap: 2 },
});
