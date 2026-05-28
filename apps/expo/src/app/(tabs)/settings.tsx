import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Icon } from "@/components/icon";
import { ThemedText } from "@/components/themed-text";
import { Spacing } from "@/constants/theme";
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
      style={[
        styles.settingsItem,
        { backgroundColor: theme.cardBackground, borderColor: theme.border },
      ]}
      onPress={onPress}
    >
      <View
        style={[styles.iconContainer, { backgroundColor: theme.primaryLight }]}
      >
        {icon}
      </View>
      <View style={styles.itemContent}>
        <ThemedText style={styles.itemTitle}>{title}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {subtitle}
        </ThemedText>
      </View>
      <Icon name="chevronRight" size={18} color={theme.textTertiary} />
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
        <ThemedText type="subtitle">Settings</ThemedText>
      </View>

      <ScrollView contentContainerStyle={styles.list}>
        <ThemedText
          type="small"
          themeColor="textSecondary"
          style={styles.sectionHeader}
        >
          Configuration
        </ThemedText>

        <SettingsItem
          icon={<Icon name="key" size={18} color={theme.primary} />}
          title="API Keys"
          subtitle="Configure provider API keys"
          onPress={() => router.push("/settings/api-keys")}
        />
        <SettingsItem
          icon={<Icon name="cpu" size={18} color={theme.primary} />}
          title="Models"
          subtitle="Voice and LLM model selection"
          onPress={() => router.push("/settings/models")}
        />
        <SettingsItem
          icon={<Icon name="languages" size={18} color={theme.primary} />}
          title="General"
          subtitle="Language, cleanup, and preferences"
          onPress={() => router.push("/settings/general")}
        />

        <ThemedText
          type="small"
          themeColor="textSecondary"
          style={styles.sectionHeader}
        >
          Personalization
        </ThemedText>

        <SettingsItem
          icon={<Icon name="book" size={18} color={theme.primary} />}
          title="Dictionary"
          subtitle="Custom word replacements"
          onPress={() => router.push("/settings/dictionary")}
        />
        <SettingsItem
          icon={<Icon name="file" size={18} color={theme.primary} />}
          title="Formats"
          subtitle="Context-aware formatting rules"
          onPress={() => router.push("/settings/formats")}
        />

        <ThemedText
          type="small"
          themeColor="textSecondary"
          style={styles.sectionHeader}
        >
          Support
        </ThemedText>

        <SettingsItem
          icon={<Icon name="message" size={18} color={theme.primary} />}
          title="Feedback"
          subtitle="Report bugs or request features"
          onPress={() => router.push("/settings/feedback")}
        />

        <View style={styles.footer}>
          <ThemedText type="small" themeColor="textTertiary">
            Freestyle v{appVersion}
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
  list: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.six,
  },
  sectionHeader: {
    marginTop: Spacing.three,
    marginBottom: Spacing.two,
    paddingHorizontal: Spacing.one,
    textTransform: "uppercase",
    letterSpacing: 1,
    fontSize: 11,
    fontWeight: "600",
  },
  settingsItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.three,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: Spacing.two,
    gap: Spacing.three,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  itemContent: {
    flex: 1,
  },
  itemTitle: {
    fontSize: 15,
    fontWeight: "600",
  },
  footer: {
    alignItems: "center",
    paddingTop: Spacing.five,
  },
});
