import { Check } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import { Linking, Pressable, StyleSheet, View } from "react-native";

import { SettingsScreenScaffold } from "@/components/settings-ui";
import { ThemedText } from "@/components/themed-text";
import { Fonts, Radius, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import {
  checkMicPermission,
  type MicPermission,
  requestMicPermission,
} from "@/lib/audio/recorder";

const STEPS = [
  "Grant microphone access below (Freestyle records your voice when you dictate).",
  "Open Settings › General › Keyboard › Keyboards.",
  "Tap “Add New Keyboard…” and choose Freestyle.",
  "Tap Freestyle in the list, then enable “Allow Full Access”.",
  "In any app, switch to the Freestyle keyboard and tap the mic to dictate.",
];

export default function KeyboardSetupScreen() {
  const theme = useTheme();
  const [micStatus, setMicStatus] = useState<MicPermission>("undetermined");

  useEffect(() => {
    void checkMicPermission().then(setMicStatus);
  }, []);

  const grantMic = useCallback(async () => {
    const status =
      (await checkMicPermission()) === "granted"
        ? "granted"
        : await requestMicPermission();
    setMicStatus(status);
    // If already denied, the prompt won't show again — send them to Settings.
    if (status === "denied") void Linking.openSettings();
  }, []);

  return (
    <SettingsScreenScaffold
      title="Voice keyboard"
      subtitle="Add the Freestyle keyboard once, then use it in any app. Tap the mic and Freestyle opens to capture your voice, then drops the transcript straight back into the field. Full Access lets the keyboard talk to Freestyle and insert your text."
    >
      <Pressable
        onPress={grantMic}
        disabled={micStatus === "granted"}
        style={[
          styles.micRow,
          {
            borderColor: micStatus === "granted" ? theme.primary : theme.border,
          },
        ]}
      >
        <View style={styles.switchLabel}>
          <ThemedText style={styles.rowLabel}>Microphone access</ThemedText>
          <ThemedText themeColor="mutedForeground" style={styles.rowHint}>
            {micStatus === "granted"
              ? "Granted — Freestyle can record your dictation."
              : micStatus === "denied"
                ? "Denied — tap to open Settings and enable it."
                : "Tap to grant microphone access."}
          </ThemedText>
        </View>
        {micStatus === "granted" ? (
          <Check color={theme.primary} size={18} />
        ) : (
          <ThemedText type="eyebrow" themeColor="primary">
            Grant
          </ThemedText>
        )}
      </Pressable>

      <View style={styles.steps}>
        {STEPS.map((step, i) => (
          <View key={step} style={styles.step}>
            <View style={[styles.badge, { backgroundColor: theme.accent }]}>
              <ThemedText
                style={[styles.badgeText, { color: theme.accentForeground }]}
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
    </SettingsScreenScaffold>
  );
}

const styles = StyleSheet.create({
  micRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
    borderWidth: 1,
    borderRadius: Radius.xl,
    padding: Spacing.three,
  },
  switchLabel: { flex: 1 },
  rowLabel: { fontFamily: Fonts.sansSemiBold, fontSize: 15 },
  rowHint: { fontSize: 13, lineHeight: 19, marginTop: 2 },
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
