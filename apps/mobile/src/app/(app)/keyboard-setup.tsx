import { Check } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import { Linking, Pressable, StyleSheet, View } from "react-native";

import {
  Card,
  OptionCard,
  SettingsScreenScaffold,
  TabScreenScaffold,
} from "@/components/settings-ui";
import { ThemedText } from "@/components/themed-text";
import { Fonts, Radius, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import {
  checkMicPermission,
  type MicPermission,
  requestMicPermission,
} from "@/lib/audio/recorder";
import { useKeyboardStatus } from "@/lib/keyboard/use-keyboard-status";
import { useSettings } from "@/lib/settings";

const STEPS = [
  "Open Settings › General › Keyboard › Keyboards.",
  "Tap “Add New Keyboard…” and choose Freestyle.",
  "Tap Freestyle in the list, then enable “Allow Full Access”.",
  "In any app, choose Dictate for instant transcription or Remix for a voice-only request.",
];

export function KeyboardSetupScreen({ isTab = false }: { isTab?: boolean }) {
  const theme = useTheme();
  const [micStatus, setMicStatus] = useState<MicPermission>("undetermined");
  const { status: keyboardStatus, ready: keyboardReady } = useKeyboardStatus();
  const { settings, setAutoListenAfterRemixQuestion } = useSettings();

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

  const content = (
    <>
      {/* Live status — flips to a confirmed state the moment the keyboard runs
          with Full Access (detected via the shared App Group handshake). */}
      {keyboardStatus !== "unsupported" ? (
        <View
          style={[
            styles.statusBanner,
            {
              backgroundColor: keyboardReady ? theme.accent : theme.secondary,
              borderColor: keyboardReady ? theme.primary : theme.border,
            },
          ]}
        >
          {keyboardReady ? (
            <Check color={theme.primary} size={18} />
          ) : (
            <View
              style={[styles.pendingDot, { backgroundColor: theme.border }]}
            />
          )}
          <View style={styles.switchLabel}>
            <ThemedText style={styles.rowLabel}>
              {keyboardReady
                ? "Freestyle keyboard is ready"
                : "Keyboard not set up yet"}
            </ThemedText>
            <ThemedText themeColor="mutedForeground" style={styles.rowHint}>
              {keyboardReady
                ? "Enabled with Full Access — dictate from any app."
                : "Follow the steps below, then return here."}
            </ThemedText>
          </View>
        </View>
      ) : null}

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

      <Card>
        <ThemedText style={styles.rowLabel}>Two voice modes</ThemedText>
        <ThemedText themeColor="mutedForeground" style={styles.rowHint}>
          Dictate pastes your spoken words. Remix hears a request, streams a
          short follow-up here if it needs one, then pastes only the finished
          result.
        </ThemedText>
      </Card>

      <Card>
        <ThemedText style={styles.rowLabel}>Remix follow-up</ThemedText>
        <ThemedText themeColor="mutedForeground" style={styles.rowHint}>
          When Remix asks a short question, start listening again automatically.
        </ThemedText>
        <OptionCard
          label="Resume listening"
          hint="Recommended for a quick voice-only keyboard flow."
          selected={settings.autoListenAfterRemixQuestion}
          onPress={() => setAutoListenAfterRemixQuestion(true)}
        />
        <OptionCard
          label="Wait for my tap"
          hint="Keep the keyboard quiet until you choose to answer."
          selected={!settings.autoListenAfterRemixQuestion}
          onPress={() => setAutoListenAfterRemixQuestion(false)}
        />
      </Card>

      <View style={styles.steps}>
        {STEPS.map((step, i) => (
          <View key={step} style={styles.step}>
            <View
              style={[
                styles.badge,
                {
                  backgroundColor: keyboardReady ? theme.primary : theme.accent,
                },
              ]}
            >
              {keyboardReady ? (
                <Check color={theme.primaryForeground} size={14} />
              ) : (
                <ThemedText
                  style={[styles.badgeText, { color: theme.accentForeground }]}
                >
                  {i + 1}
                </ThemedText>
              )}
            </View>
            <ThemedText style={styles.stepText}>{step}</ThemedText>
          </View>
        ))}
      </View>

      {!keyboardReady ? (
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
      ) : null}
    </>
  );

  const subtitle =
    "Add the Freestyle keyboard once, then use it in any app. Choose Dictate to paste what you say, or Remix to give the agent a voice-only request. Full Access lets the keyboard talk to Freestyle and insert the finished text.";

  if (isTab) {
    return (
      <TabScreenScaffold title="Keyboard" subtitle={subtitle}>
        {content}
      </TabScreenScaffold>
    );
  }

  return (
    <SettingsScreenScaffold title="Voice keyboard" subtitle={subtitle}>
      {content}
    </SettingsScreenScaffold>
  );
}

export default KeyboardSetupScreen;

const styles = StyleSheet.create({
  statusBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
    borderWidth: 1,
    borderRadius: Radius.xl,
    padding: Spacing.three,
  },
  pendingDot: { width: 12, height: 12, borderRadius: Radius.full },
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
