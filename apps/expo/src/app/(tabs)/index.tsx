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
import { Spacing } from "@/constants/theme";
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

      buttonScale.value = withTiming(0.9, { duration: 100 });
      pulseScale.value = withRepeat(
        withSequence(
          withTiming(1.6, { duration: 1000 }),
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
        ? "Recording... release to transcribe"
        : state === "transcribing"
          ? "Transcribing..."
          : state === "error"
            ? "Error"
            : "";

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.background }]}
    >
      <View style={styles.content}>
        <View style={styles.header}>
          <ThemedText type="subtitle" style={styles.title}>
            Freestyle
          </ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.subtitle}>
            Voice to text
          </ThemedText>
        </View>

        {state === "recording" && (
          <View style={styles.visualizer}>
            {Array.from({ length: 12 }).map((_, i) => {
              const durationSec = recorderState.durationMillis / 1000;
              const activity = Math.min(1, durationSec / 2);
              const barHeight = Math.max(
                8,
                activity * 48 * (0.3 + Math.random() * 0.7) + 8,
              );
              return (
                <View
                  key={i}
                  style={[
                    styles.visualizerBar,
                    {
                      height: barHeight,
                      backgroundColor: theme.primary,
                      opacity: 0.5 + activity * 0.5,
                    },
                  ]}
                />
              );
            })}
          </View>
        )}

        {(state === "result" || state === "error") && (
          <View
            style={[
              styles.resultContainer,
              {
                backgroundColor: theme.cardBackground,
                borderColor: theme.border,
              },
            ]}
          >
            <View style={styles.resultHeader}>
              <ThemedText type="small" themeColor="textSecondary">
                {state === "error" ? "Error" : "Transcription"}
              </ThemedText>
              <Pressable onPress={handleDismiss} hitSlop={12}>
                <Icon name="close" size={18} color={theme.textSecondary} />
              </Pressable>
            </View>

            <ScrollView style={styles.resultScroll}>
              <ThemedText
                style={[state === "error" && { color: theme.danger }]}
              >
                {state === "error" ? errorMessage : transcript}
              </ThemedText>
            </ScrollView>

            {state === "result" && (
              <View style={styles.actionRow}>
                <Pressable
                  style={[
                    styles.actionButton,
                    { backgroundColor: theme.primaryLight },
                  ]}
                  onPress={handleCopy}
                >
                  <Icon name="copy" size={16} color={theme.primary} />
                  <ThemedText style={{ color: theme.primary, fontSize: 14 }}>
                    {copied ? "Copied!" : "Copy"}
                  </ThemedText>
                </Pressable>

                <Pressable
                  style={[
                    styles.actionButton,
                    { backgroundColor: theme.backgroundElement },
                  ]}
                  onPress={handleShare}
                >
                  <Icon name="share" size={16} color={theme.text} />
                  <ThemedText style={{ fontSize: 14 }}>Share</ThemedText>
                </Pressable>
              </View>
            )}
          </View>
        )}

        <View style={styles.micSection}>
          <ThemedText themeColor="textSecondary" style={styles.statusText}>
            {statusText}
          </ThemedText>

          <View style={styles.micButtonContainer}>
            {state === "recording" && (
              <Animated.View
                style={[
                  styles.pulseRing,
                  { borderColor: theme.primary },
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
                    backgroundColor:
                      state === "recording" ? theme.danger : theme.primary,
                    opacity: state === "transcribing" ? 0.5 : 1,
                  },
                ]}
              >
                <Icon name="mic" size={32} color="#FFFFFF" />
              </Pressable>
            </Animated.View>
          </View>

          {state === "transcribing" && (
            <ThemedText
              themeColor="textSecondary"
              style={styles.processingText}
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
    paddingTop: Spacing.five,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
  },
  subtitle: {
    marginTop: Spacing.one,
    fontSize: 15,
  },
  visualizer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    height: 64,
  },
  visualizerBar: {
    width: 4,
    borderRadius: 2,
    minHeight: 8,
  },
  resultContainer: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    padding: Spacing.three,
    marginVertical: Spacing.three,
    maxHeight: 300,
  },
  resultHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.two,
  },
  resultScroll: {
    flex: 1,
  },
  actionRow: {
    flexDirection: "row",
    gap: Spacing.two,
    marginTop: Spacing.three,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.one,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: 12,
  },
  micSection: {
    alignItems: "center",
    paddingBottom: Spacing.six,
    gap: Spacing.three,
  },
  statusText: {
    fontSize: 14,
    textAlign: "center",
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
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  processingText: {
    fontSize: 13,
  },
});
