import { useRouter } from "expo-router";
import { Linking, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Fonts, Radius, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

const STEPS = [
  "Open Settings › General › Keyboard › Keyboards.",
  "Tap “Add New Keyboard…” and choose Freestyle.",
  "Tap Freestyle in the list, then enable “Allow Full Access”.",
  "In any app, long-press the globe and pick Freestyle to dictate.",
];

export default function KeyboardSetupScreen() {
  const theme = useTheme();
  const router = useRouter();

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <ThemedText type="eyebrow" themeColor="primary">
              Back
            </ThemedText>
          </Pressable>
          <ThemedText type="eyebrow" themeColor="mutedForeground">
            Voice Keyboard
          </ThemedText>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <ThemedText type="display" style={styles.title}>
            Type anywhere with your voice
          </ThemedText>
          <ThemedText themeColor="mutedForeground" style={styles.lede}>
            Add the Freestyle keyboard once, then dictate into any app. Full
            Access is required so the keyboard can reach the microphone and
            Freestyle Cloud.
          </ThemedText>

          <View style={styles.steps}>
            {STEPS.map((step, i) => (
              <View key={step} style={styles.step}>
                <View style={[styles.badge, { backgroundColor: theme.accent }]}>
                  <ThemedText
                    style={[
                      styles.badgeText,
                      { color: theme.accentForeground },
                    ]}
                  >
                    {i + 1}
                  </ThemedText>
                </View>
                <ThemedText style={styles.stepText}>{step}</ThemedText>
              </View>
            ))}
          </View>

          <Pressable
            onPress={() => void Linking.openSettings()}
            style={[styles.cta, { backgroundColor: theme.primary }]}
          >
            <ThemedText
              style={[styles.ctaText, { color: theme.primaryForeground }]}
            >
              Open Settings
            </ThemedText>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, paddingHorizontal: Spacing.four },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: Spacing.two,
  },
  content: { paddingVertical: Spacing.four, gap: Spacing.four },
  title: { fontSize: 40, lineHeight: 42, letterSpacing: -1 },
  lede: { fontSize: 15, lineHeight: 22 },
  steps: { gap: Spacing.three, marginTop: Spacing.two },
  step: { flexDirection: "row", alignItems: "flex-start", gap: Spacing.three },
  badge: {
    width: 26,
    height: 26,
    borderRadius: Radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { fontFamily: Fonts.sansSemiBold, fontSize: 13 },
  stepText: { flex: 1, fontFamily: Fonts.sans, fontSize: 15, lineHeight: 22 },
  cta: {
    marginTop: Spacing.two,
    height: 52,
    borderRadius: Radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaText: { fontFamily: Fonts.sansSemiBold, fontSize: 16 },
});
