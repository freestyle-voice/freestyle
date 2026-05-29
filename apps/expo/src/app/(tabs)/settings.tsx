import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Icon } from "@/components/icon";
import { ThemedText } from "@/components/themed-text";
import { Fonts, Radius, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

const appVersion = Constants.expoConfig?.version ?? "0.1.0";

interface SettingsItemProps {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onPress: () => void;
}

function SettingsItem({ icon, title, subtitle, onPress }: SettingsItemProps) {
  const theme = useTheme();

  return (
    <Pressable
      style={[styles.settingsItem, { borderBottomColor: `${theme.border}99` }]}
      onPress={onPress}
    >
      <View
        style={[styles.iconContainer, { backgroundColor: `${theme.accent}99` }]}
      >
        {icon}
      </View>
      <View style={styles.itemContent}>
        <ThemedText style={styles.itemTitle}>{title}</ThemedText>
        <ThemedText
          style={[styles.itemSubtitle, { color: theme.mutedForeground }]}
        >
          {subtitle}
        </ThemedText>
      </View>
      <Icon name="chevronRight" size={16} color={theme.mutedForeground} />
    </Pressable>
  );
}

export default function SettingsScreen() {
  const theme = useTheme();
  const router = useRouter();

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.background }]}
    >
      <View style={styles.header}>
        <ThemedText
          style={[
            styles.title,
            { fontFamily: Fonts?.serif, color: theme.primary },
          ]}
        >
          Settings.
        </ThemedText>
      </View>

      <ScrollView contentContainerStyle={styles.list}>
        <ThemedText
          style={[
            styles.sectionLabel,
            { color: theme.mutedForeground, fontFamily: Fonts?.mono },
          ]}
        >
          CONFIGURATION
        </ThemedText>

        <View
          style={[
            styles.sectionCard,
            {
              backgroundColor: theme.cardBackground,
              borderColor: theme.border,
            },
          ]}
        >
          <SettingsItem
            icon={<Icon name="key" size={16} color={theme.accentForeground} />}
            title="API Keys"
            subtitle="Configure provider credentials"
            onPress={() => router.push("/settings/api-keys")}
          />
          <SettingsItem
            icon={<Icon name="cpu" size={16} color={theme.accentForeground} />}
            title="Models"
            subtitle="Voice and LLM model selection"
            onPress={() => router.push("/settings/models")}
          />
          <SettingsItem
            icon={
              <Icon name="languages" size={16} color={theme.accentForeground} />
            }
            title="General"
            subtitle="Language and preferences"
            onPress={() => router.push("/settings/general")}
          />
        </View>

        <ThemedText
          style={[
            styles.sectionLabel,
            { color: theme.mutedForeground, fontFamily: Fonts?.mono },
          ]}
        >
          PERSONALIZATION
        </ThemedText>

        <View
          style={[
            styles.sectionCard,
            {
              backgroundColor: theme.cardBackground,
              borderColor: theme.border,
            },
          ]}
        >
          <SettingsItem
            icon={<Icon name="book" size={16} color={theme.accentForeground} />}
            title="Dictionary"
            subtitle="Custom word replacements"
            onPress={() => router.push("/settings/dictionary")}
          />
          <SettingsItem
            icon={<Icon name="file" size={16} color={theme.accentForeground} />}
            title="Formats"
            subtitle="Context-aware formatting rules"
            onPress={() => router.push("/settings/formats")}
          />
        </View>

        <ThemedText
          style={[
            styles.sectionLabel,
            { color: theme.mutedForeground, fontFamily: Fonts?.mono },
          ]}
        >
          SUPPORT
        </ThemedText>

        <View
          style={[
            styles.sectionCard,
            {
              backgroundColor: theme.cardBackground,
              borderColor: theme.border,
            },
          ]}
        >
          <SettingsItem
            icon={
              <Icon name="message" size={16} color={theme.accentForeground} />
            }
            title="Feedback"
            subtitle="Report bugs or request features"
            onPress={() => router.push("/settings/feedback")}
          />
        </View>

        <View style={styles.footer}>
          <ThemedText
            style={[
              styles.footerText,
              { color: theme.mutedForeground, fontFamily: Fonts?.mono },
            ]}
          >
            FREESTYLE v{appVersion.toUpperCase()}
          </ThemedText>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.three,
  },
  title: {
    fontSize: 32,
    fontWeight: "400",
    fontStyle: "italic",
  },
  list: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.six,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 1.8,
    textTransform: "uppercase",
    marginTop: Spacing.four,
    marginBottom: Spacing.two,
    paddingHorizontal: Spacing.one,
  },
  sectionCard: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    overflow: "hidden",
  },
  settingsItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.three + 2,
    paddingVertical: Spacing.three,
    gap: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: Radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  itemContent: {
    flex: 1,
  },
  itemTitle: {
    fontSize: 15,
    fontWeight: "500",
  },
  itemSubtitle: {
    fontSize: 12.5,
    marginTop: 1,
  },
  footer: {
    alignItems: "center",
    paddingTop: Spacing.five,
  },
  footerText: {
    fontSize: 10,
    letterSpacing: 1.2,
  },
});
