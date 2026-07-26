import { useRouter } from "expo-router";
import { Check, ClipboardCheck, Mic, Sparkles } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import { Linking, Platform, Pressable, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Fonts, Radius, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import {
  checkMicPermission,
  type MicPermission,
  requestMicPermission,
} from "@/lib/audio/recorder";
import { useOnboarding } from "@/lib/onboarding";
import { LANGUAGES, type LanguageCode, useSettings } from "@/lib/settings";

const TUTORIAL_STEPS = [
  { Icon: Mic, text: "Hold or tap the mic to start recording." },
  { Icon: Sparkles, text: "Speak naturally — Freestyle cleans it up." },
  {
    Icon: ClipboardCheck,
    text: "Copy, share, or paste your text anywhere.",
  },
] as const;

export default function OnboardingScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { finish } = useOnboarding();
  const { settings, setLanguage } = useSettings();

  const [step, setStep] = useState<0 | 1 | 2>(0);
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

  const complete = useCallback(() => {
    finish();
    router.replace("/(app)/(tabs)");
  }, [finish, router]);

  const canContinueStep0 = micStatus === "granted";

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.progress}>
          {[0, 1, 2].map((i) => (
            <View
              key={i}
              style={[
                styles.dot,
                { backgroundColor: i === step ? theme.primary : theme.border },
              ]}
            />
          ))}
        </View>

        <View style={styles.body}>
          {step === 0 ? (
            <StepPermissions
              micStatus={micStatus}
              onGrantMic={grantMic}
              theme={theme}
            />
          ) : step === 1 ? (
            <StepLanguage
              selected={settings.language}
              onSelect={setLanguage}
              theme={theme}
            />
          ) : (
            <StepTutorial />
          )}
        </View>

        <View style={styles.footer}>
          <View style={styles.footerRow}>
            {step > 0 ? (
              <Pressable
                onPress={() => setStep((s) => (s === 2 ? 1 : 0))}
                style={styles.backButton}
              >
                <ThemedText
                  themeColor="mutedForeground"
                  style={styles.backText}
                >
                  Back
                </ThemedText>
              </Pressable>
            ) : (
              <View style={styles.backButton} />
            )}
            {step > 0 ? (
              <Pressable onPress={complete} style={styles.skipButton}>
                <ThemedText
                  themeColor="mutedForeground"
                  style={styles.backText}
                >
                  Skip
                </ThemedText>
              </Pressable>
            ) : null}
          </View>

          <Pressable
            onPress={
              step === 2 ? complete : () => setStep((s) => (s === 0 ? 1 : 2))
            }
            disabled={step === 0 && !canContinueStep0}
            style={[
              styles.cta,
              { backgroundColor: theme.primary },
              step === 0 && !canContinueStep0 ? styles.ctaDisabled : null,
            ]}
          >
            <ThemedText
              style={[styles.ctaText, { color: theme.primaryForeground }]}
            >
              {step === 2 ? "Get started" : "Continue"}
            </ThemedText>
          </Pressable>
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

function StepPermissions({
  micStatus,
  onGrantMic,
  theme,
}: {
  micStatus: MicPermission;
  onGrantMic: () => void;
  theme: ReturnType<typeof useTheme>;
}) {
  return (
    <View style={styles.stepContent}>
      <ThemedText type="display" style={styles.title}>
        Let's get{" "}
        <ThemedText type="displayItalic" themeColor="primary">
          set up
        </ThemedText>
        <ThemedText type="display">.</ThemedText>
      </ThemedText>

      <Pressable
        onPress={onGrantMic}
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

      {Platform.OS === "ios" ? (
        <ThemedText themeColor="mutedForeground" style={styles.mutedLine}>
          You can set up the voice keyboard later in Settings.
        </ThemedText>
      ) : null}
    </View>
  );
}

function StepLanguage({
  selected,
  onSelect,
  theme,
}: {
  selected: LanguageCode;
  onSelect: (code: LanguageCode) => void;
  theme: ReturnType<typeof useTheme>;
}) {
  return (
    <View style={styles.stepContent}>
      <ThemedText type="display" style={styles.title}>
        What language do you{" "}
        <ThemedText type="displayItalic" themeColor="primary">
          speak
        </ThemedText>
        <ThemedText type="display">?</ThemedText>
      </ThemedText>

      <View style={styles.pillGrid}>
        {LANGUAGES.map((lang) => {
          const active = lang.code === selected;
          return (
            <Pressable
              key={lang.code}
              onPress={() => onSelect(lang.code)}
              style={[
                styles.pill,
                active
                  ? { backgroundColor: theme.primary }
                  : { borderWidth: 1, borderColor: theme.border },
              ]}
            >
              <ThemedText
                style={[
                  styles.pillText,
                  {
                    color: active ? theme.primaryForeground : theme.foreground,
                  },
                ]}
              >
                {lang.name}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function StepTutorial() {
  const theme = useTheme();

  return (
    <View style={styles.stepContent}>
      <ThemedText type="display" style={styles.title}>
        How it{" "}
        <ThemedText type="displayItalic" themeColor="primary">
          works
        </ThemedText>
        <ThemedText type="display">.</ThemedText>
      </ThemedText>

      <View style={styles.steps}>
        {TUTORIAL_STEPS.map(({ Icon, text }) => (
          <View key={text} style={styles.step}>
            <View style={[styles.badge, { backgroundColor: theme.accent }]}>
              <Icon color={theme.accentForeground} size={18} />
            </View>
            <ThemedText style={styles.stepText}>{text}</ThemedText>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    justifyContent: "space-between",
  },
  progress: {
    flexDirection: "row",
    justifyContent: "center",
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  dot: { width: 8, height: 8, borderRadius: Radius.full },
  body: { flex: 1, justifyContent: "center" },
  stepContent: { gap: Spacing.four },
  title: { marginBottom: Spacing.one },
  mutedLine: { fontSize: 13, lineHeight: 19 },
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
  pillGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.two,
  },
  pill: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.full,
  },
  pillText: { fontFamily: Fonts.sansMedium, fontSize: 14 },
  steps: { gap: Spacing.three },
  step: { flexDirection: "row", alignItems: "flex-start", gap: Spacing.three },
  badge: {
    width: 34,
    height: 34,
    borderRadius: Radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  stepText: {
    flex: 1,
    fontFamily: Fonts.sans,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 6,
  },
  footer: { paddingBottom: Spacing.five, gap: Spacing.two },
  footerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    minHeight: 32,
  },
  backButton: { paddingVertical: Spacing.one },
  skipButton: { paddingVertical: Spacing.one },
  backText: { fontFamily: Fonts.sansMedium, fontSize: 14 },
  cta: {
    height: 54,
    borderRadius: Radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaDisabled: { opacity: 0.5 },
  ctaText: { fontFamily: Fonts.sansSemiBold, fontSize: 16 },
});
