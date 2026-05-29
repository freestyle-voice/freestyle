import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, Share, StyleSheet, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

import { Icon } from "@/components/icon";
import { ThemedText } from "@/components/themed-text";
import { Fonts, Radius, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { addHistoryEntry } from "@/lib/db";
import { postProcess } from "@/lib/post-process";
import { transcribeAudio } from "@/lib/transcribe";

type RecordState = "idle" | "recording" | "transcribing" | "result" | "error";

const MIN_RECORDING_MS = 500;

export default function RecordScreen() {
  const theme = useTheme();
  const [state, setState] = useState<RecordState>("idle");
  const [transcript, setTranscript] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [copied, setCopied] = useState(false);
  const recordStartTime = useRef(0);
  const isRecordingRef = useRef(false);

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 100);

  const pulseScale = useSharedValue(1);
  const buttonScale = useSharedValue(1);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    opacity: 2 - pulseScale.value,
  }));

  const buttonAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: buttonScale.value }],
  }));

  useEffect(() => {
    async function setupPermissions() {
      const { granted } = await AudioModule.requestRecordingPermissionsAsync();
      if (granted) {
        await setAudioModeAsync({
          allowsRecording: true,
          playsInSilentMode: true,
        });
      }
    }
    setupPermissions();
  }, []);

  const handlePressIn = useCallback(async () => {
    if (isRecordingRef.current) return;

    try {
      setState("recording");
      setTranscript("");
      setErrorMessage("");
      setCopied(false);
      recordStartTime.current = Date.now();
      isRecordingRef.current = true;

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      buttonScale.value = withTiming(0.92, { duration: 100 });
      pulseScale.value = withRepeat(
        withSequence(
          withTiming(1.5, { duration: 1200 }),
          withTiming(1, { duration: 0 }),
        ),
        -1,
      );

      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch (err) {
      console.error("Failed to start recording:", err);
      isRecordingRef.current = false;
      setState("error");
      setErrorMessage(
        "Failed to start recording. Check microphone permissions.",
      );
    }
  }, [buttonScale, pulseScale, recorder]);

  const handlePressOut = useCallback(async () => {
    buttonScale.value = withTiming(1, { duration: 100 });
    pulseScale.value = withTiming(1, { duration: 200 });

    if (!isRecordingRef.current) return;
    isRecordingRef.current = false;

    const elapsed = Date.now() - recordStartTime.current;
    if (elapsed < MIN_RECORDING_MS) {
      try {
        await recorder.stop();
      } catch {}
      setState("idle");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }

    try {
      setState("transcribing");
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      await recorder.stop();
      const uri = recorder.uri;
      if (!uri) {
        setState("idle");
        return;
      }

      const transcription = await transcribeAudio(uri);
      if (!transcription.raw.trim()) {
        setState("idle");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        return;
      }

      const processed = await postProcess(transcription.raw);
      const finalText = processed.cleaned || transcription.raw;

      setTranscript(finalText);
      setState("result");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      await addHistoryEntry({
        raw_text: transcription.raw,
        cleaned_text:
          processed.cleaned !== transcription.raw ? processed.cleaned : null,
        voice_provider: transcription.provider,
        voice_model: transcription.model,
        llm_provider: processed.llmProvider,
        llm_model: processed.llmModel,
        duration_ms: elapsed,
        audio_duration_ms: elapsed,
        input_tokens: processed.inputTokens,
        output_tokens: processed.outputTokens,
        cost_usd: processed.costUsd,
      });
    } catch (err: any) {
      console.error("Transcription failed:", err);
      setState("error");
      setErrorMessage(
        err?.message || "Transcription failed. Please try again.",
      );
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }, [buttonScale, pulseScale, recorder]);

  const handleCopy = async () => {
    await Clipboard.setStringAsync(transcript);
    setCopied(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = async () => {
    await Share.share({ message: transcript });
  };

  const handleDismiss = () => {
    setState("idle");
    setTranscript("");
    setErrorMessage("");
  };

  const statusText =
    state === "idle"
      ? "Hold to record"
      : state === "recording"
        ? "Release to transcribe"
        : state === "transcribing"
          ? "Transcribing..."
          : "";

  const orbColor =
    state === "recording"
      ? theme.danger
      : state === "transcribing"
        ? "#60A5FA"
        : theme.primary;

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.background }]}
    >
      <View style={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <ThemedText
            style={[
              styles.title,
              { fontFamily: Fonts?.serif, color: theme.primary },
            ]}
          >
            Freestyle.
          </ThemedText>
        </View>

        {/* Visualizer area */}
        {state === "recording" && (
          <View style={styles.visualizer}>
            {Array.from({ length: 14 }).map((_, i) => {
              const activity = Math.min(1, recorderState.durationMillis / 2000);
              const barHeight = Math.max(
                4,
                activity * 24 * (0.3 + Math.random() * 0.7) + 4,
              );
              return (
                <View
                  key={i}
                  style={[
                    styles.visualizerBar,
                    {
                      height: barHeight,
                      backgroundColor: theme.mutedForeground,
                    },
                  ]}
                />
              );
            })}
          </View>
        )}

        {/* Result card */}
        {(state === "result" || state === "error") && (
          <View
            style={[
              styles.resultCard,
              {
                backgroundColor: theme.cardBackground,
                borderColor: theme.border,
              },
            ]}
          >
            <View style={styles.resultHeader}>
              <ThemedText
                style={[
                  styles.eyebrow,
                  { color: theme.mutedForeground, fontFamily: Fonts?.mono },
                ]}
              >
                {state === "error" ? "ERROR" : "TRANSCRIPTION"}
              </ThemedText>
              <Pressable onPress={handleDismiss} hitSlop={12}>
                <Icon name="close" size={16} color={theme.mutedForeground} />
              </Pressable>
            </View>

            <ScrollView style={styles.resultScroll}>
              <ThemedText
                style={[
                  styles.resultText,
                  state === "error" && { color: theme.danger },
                ]}
              >
                {state === "error" ? errorMessage : transcript}
              </ThemedText>
            </ScrollView>

            {state === "result" && (
              <View style={styles.actionRow}>
                <Pressable
                  style={[
                    styles.actionButton,
                    { backgroundColor: theme.primary },
                  ]}
                  onPress={handleCopy}
                >
                  <ThemedText style={styles.actionButtonText}>
                    {copied ? "Copied" : "Copy"}
                  </ThemedText>
                </Pressable>

                <Pressable
                  style={[
                    styles.actionButtonOutline,
                    { borderColor: theme.border },
                  ]}
                  onPress={handleShare}
                >
                  <ThemedText
                    style={[
                      styles.actionButtonTextOutline,
                      { color: theme.text },
                    ]}
                  >
                    Share
                  </ThemedText>
                </Pressable>
              </View>
            )}
          </View>
        )}

        {/* Mic section */}
        <View style={styles.micSection}>
          <ThemedText
            style={[styles.statusText, { color: theme.mutedForeground }]}
          >
            {statusText}
          </ThemedText>

          <View style={styles.micButtonContainer}>
            {state === "recording" && (
              <Animated.View
                style={[
                  styles.pulseRing,
                  {
                    borderColor: orbColor,
                    backgroundColor: `${orbColor}10`,
                  },
                  pulseStyle,
                ]}
              />
            )}
            <Animated.View style={buttonAnimStyle}>
              <Pressable
                onPressIn={handlePressIn}
                onPressOut={handlePressOut}
                disabled={state === "transcribing"}
                style={[
                  styles.micButton,
                  {
                    backgroundColor: orbColor,
                    opacity: state === "transcribing" ? 0.6 : 1,
                  },
                ]}
              >
                <Icon name="mic" size={28} color={theme.primaryForeground} />
              </Pressable>
            </Animated.View>
          </View>

          {state === "transcribing" && (
            <ThemedText
              style={[styles.processingText, { color: theme.mutedForeground }]}
            >
              Processing your voice...
            </ThemedText>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    justifyContent: "space-between",
  },
  header: {
    alignItems: "center",
    paddingTop: Spacing.six,
  },
  title: {
    fontSize: 36,
    fontWeight: "400",
    fontStyle: "italic",
  },
  visualizer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    height: 32,
  },
  visualizerBar: {
    width: 3,
    borderRadius: 2,
    minHeight: 4,
  },
  resultCard: {
    flex: 1,
    borderRadius: Radius.xl,
    borderWidth: 1,
    padding: Spacing.four,
    marginVertical: Spacing.three,
    maxHeight: 320,
  },
  resultHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.three,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 1.8,
    textTransform: "uppercase",
  },
  resultScroll: {
    flex: 1,
  },
  resultText: {
    fontSize: 16,
    lineHeight: 25,
  },
  actionRow: {
    flexDirection: "row",
    gap: Spacing.two,
    marginTop: Spacing.three,
  },
  actionButton: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radius.md,
  },
  actionButtonText: {
    color: "#FBF8EE",
    fontSize: 12.5,
    fontWeight: "500",
  },
  actionButtonOutline: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  actionButtonTextOutline: {
    fontSize: 12.5,
    fontWeight: "500",
  },
  micSection: {
    alignItems: "center",
    paddingBottom: Spacing.six,
    gap: Spacing.three,
  },
  statusText: {
    fontSize: 13,
    fontWeight: "500",
  },
  micButtonContainer: {
    width: 80,
    height: 80,
    alignItems: "center",
    justifyContent: "center",
  },
  pulseRing: {
    position: "absolute",
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
  },
  micButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  processingText: {
    fontSize: 13,
  },
});
