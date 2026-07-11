import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Pressable, StyleSheet, View } from "react-native";
import { useSharedValue } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

import { MicButton, type MicState } from "@/components/mic-button";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { TranscriptView } from "@/components/transcript-view";
import { Waveform } from "@/components/waveform";
import { Fonts, Radius, Spacing } from "@/constants/theme";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/hooks/use-theme";
import {
  checkMicPermission,
  requestMicPermission,
  useRecorder,
} from "@/lib/audio/recorder";
import { DEFAULT_INTENSITY } from "@/lib/cleanup-tones";
import { authHeaders } from "@/lib/cloud/session";
import { CloudStreamSession } from "@/lib/cloud/stream";
import { setPendingTranscript } from "@/lib/keyboard-bridge";
import { languageHint, tonesForCloud, useSettings } from "@/lib/settings";

const MIN_RECORDING_MS = 350;

/**
 * Focused dictation screen launched by the keyboard (`freestyle://dictate`).
 * Records + streams like the main voice screen, but on the final transcript it
 * hands the text to the keyboard via the App Group and prompts the user to
 * return to where they were typing — the keyboard inserts it on reappearance.
 */
export default function DictateScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { signedIn } = useAuth();
  const { settings } = useSettings();

  const [micState, setMicState] = useState<MicState>("idle");
  const [partial, setPartial] = useState("");
  const [result, setResult] = useState("");
  const level = useSharedValue(0);

  const sessionRef = useRef<CloudStreamSession | null>(null);
  const startedAt = useRef(0);
  const recordingRef = useRef(false);
  const startingRef = useRef(false);
  const autoStarted = useRef(false);

  const recorder = useRecorder({
    onFrame: (frame) => sessionRef.current?.sendAudio(frame),
    onLevel: (v) => {
      level.value = v;
    },
  });

  const teardownSession = useCallback(() => {
    sessionRef.current?.close();
    sessionRef.current = null;
  }, []);

  useEffect(() => teardownSession, [teardownSession]);

  const beginRecording = useCallback(async () => {
    if (recordingRef.current || startingRef.current || !signedIn) return;
    const headers = authHeaders();
    if (!headers) return;
    startingRef.current = true;

    const perm =
      (await checkMicPermission()) === "granted"
        ? "granted"
        : await requestMicPermission();
    if (perm !== "granted") {
      startingRef.current = false;
      Alert.alert(
        "Microphone needed",
        "Enable microphone access in Settings to dictate.",
      );
      return;
    }

    recordingRef.current = true;
    startingRef.current = false;
    startedAt.current = Date.now();
    setPartial("");
    setResult("");
    setMicState("recording");
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    sessionRef.current = new CloudStreamSession({
      cookie: headers.Cookie,
      language: languageHint(settings.language),
      cleanup: {
        skipPostProcess: !settings.cleanup,
        intensity: DEFAULT_INTENSITY,
        ...tonesForCloud(settings),
      },
      callbacks: {
        onReady: () => {},
        onPartial: (t) => setPartial(t),
        onFinal: (t) => {
          setPartial("");
          const text = t.trim();
          setMicState("idle");
          teardownSession();
          if (text) {
            setResult(text);
            // Hand the transcript to the keyboard for insertion.
            setPendingTranscript(text);
          }
          void Haptics.notificationAsync(
            Haptics.NotificationFeedbackType.Success,
          );
        },
        onError: (message, code) => {
          setMicState("idle");
          teardownSession();
          if (code === "usage_exceeded") {
            Alert.alert(
              "Out of credits",
              "You've used your free Freestyle credits for now.",
            );
          } else {
            Alert.alert("Transcription failed", message);
          }
          void Haptics.notificationAsync(
            Haptics.NotificationFeedbackType.Error,
          );
        },
        onClose: () => {
          setMicState((s) => (s === "finalizing" ? "idle" : s));
        },
      },
    });

    try {
      await recorder.start();
    } catch {
      recordingRef.current = false;
      startingRef.current = false;
      setMicState("idle");
      teardownSession();
      Alert.alert("Recording failed", "Could not start the microphone.");
    }
  }, [recorder, settings, teardownSession, signedIn]);

  const finishRecording = useCallback(() => {
    if (!recordingRef.current) return;
    recordingRef.current = false;
    level.value = 0;
    recorder.stop();

    const elapsed = Date.now() - startedAt.current;
    if (elapsed < MIN_RECORDING_MS) {
      teardownSession();
      setMicState("idle");
      return;
    }

    setMicState("finalizing");
    sessionRef.current?.setAudioDurationMs(elapsed);
    sessionRef.current?.commit();
  }, [recorder, teardownSession, level]);

  // Auto-start recording as soon as the screen opens (it was launched by a mic
  // tap on the keyboard), so the user can just speak.
  useEffect(() => {
    if (autoStarted.current || !signedIn) return;
    autoStarted.current = true;
    void beginRecording();
  }, [beginRecording, signedIn]);

  const toggle = useCallback(() => {
    if (recordingRef.current) finishRecording();
    else void beginRecording();
  }, [beginRecording, finishRecording]);

  const status =
    micState === "recording"
      ? "Listening — tap when done"
      : micState === "finalizing"
        ? "Polishing"
        : result
          ? "Ready to insert"
          : "Tap to speak";

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <ThemedText type="eyebrow" themeColor="mutedForeground">
            Voice Keyboard
          </ThemedText>
          <Pressable onPress={() => router.replace("/(app)")} hitSlop={12}>
            <ThemedText type="eyebrow" themeColor="primary">
              Done
            </ThemedText>
          </Pressable>
        </View>

        <TranscriptView
          text={result}
          partial={partial}
          placeholder="Speak and your words appear here."
        />

        {result && micState === "idle" ? (
          <View style={[styles.returnCard, { borderColor: theme.border }]}>
            <ThemedText style={styles.returnTitle}>
              Return to your app
            </ThemedText>
            <ThemedText themeColor="mutedForeground" style={styles.returnHint}>
              Switch back to where you were typing — the Freestyle keyboard will
              drop this text in for you.
            </ThemedText>
          </View>
        ) : null}

        <View style={styles.footer}>
          <Waveform level={level} active={micState === "recording"} />
          <ThemedText themeColor="mutedForeground" style={styles.status}>
            {status}
          </ThemedText>
          <MicButton
            state={micState}
            level={level}
            onPressIn={toggle}
            onPressOut={() => {}}
          />
        </View>
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
    paddingTop: Spacing.three,
    paddingBottom: Spacing.two,
  },
  returnCard: {
    borderWidth: 1,
    borderRadius: Radius.lg,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  returnTitle: { fontFamily: Fonts.sansSemiBold, fontSize: 15 },
  returnHint: { fontSize: 13, lineHeight: 19 },
  footer: {
    alignItems: "center",
    gap: Spacing.three,
    paddingBottom: Spacing.five,
  },
  status: {
    fontFamily: Fonts.mono,
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
});
