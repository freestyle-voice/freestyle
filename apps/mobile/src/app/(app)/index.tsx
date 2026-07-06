import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Pressable, Share, StyleSheet, View } from "react-native";
import { useSharedValue } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

import { SettingsGlyph } from "@/components/icons";
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
import { authHeaders } from "@/lib/cloud/session";
import { CloudStreamSession } from "@/lib/cloud/stream";
import { languageHint, useSettings } from "@/lib/settings";

/** Debounce so an accidental tap/hold doesn't open a pointless session. */
const MIN_RECORDING_MS = 350;

export default function VoiceScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { signedIn } = useAuth();
  const { settings } = useSettings();

  const [micState, setMicState] = useState<MicState>("idle");
  const [text, setText] = useState("");
  const [partial, setPartial] = useState("");
  const [copied, setCopied] = useState(false);
  // Mic level as a shared value so the mic button + waveform animate on the UI
  // thread (smooth) rather than re-rendering React on every audio buffer.
  const level = useSharedValue(0);

  const sessionRef = useRef<CloudStreamSession | null>(null);
  const startedAt = useRef(0);
  const recordingRef = useRef(false);
  // Set synchronously on press-in so a rapid double-tap can't kick off two
  // recordings before the async permission check flips `recordingRef`.
  const startingRef = useRef(false);
  // Timestamp of the last press-in, used to tell a hold (stop on release) from
  // a quick tap (toggle: stop on the next tap).
  const pressInAt = useRef(0);

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
    setCopied(false);
    setMicState("recording");
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    sessionRef.current = new CloudStreamSession({
      cookie: headers.Cookie,
      language: languageHint(settings.language),
      cleanup: { skipPostProcess: !settings.cleanup, intensity: "low" },
      callbacks: {
        onReady: () => {},
        onPartial: (t) => setPartial(t),
        onFinal: (t) => {
          setPartial("");
          if (t.trim())
            setText((prev) => (prev ? `${prev} ${t.trim()}` : t.trim()));
          setMicState("idle");
          teardownSession();
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
          // If the socket drops while we're still waiting on the final
          // transcript, don't leave the UI stuck in "finalizing".
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

  // Hold threshold: pressing longer than this and releasing = hold-to-talk
  // (stop on release). A quick tap = toggle (stop on the next tap).
  const HOLD_THRESHOLD_MS = 300;

  const handlePressIn = useCallback(() => {
    // A press while already recording is the second tap of a tap-to-toggle
    // interaction → stop.
    if (recordingRef.current) {
      finishRecording();
      return;
    }
    pressInAt.current = Date.now();
    void beginRecording();
  }, [beginRecording, finishRecording]);

  const handlePressOut = useCallback(() => {
    if (!recordingRef.current) return;
    // Long enough to count as a hold → finish on release. Otherwise it was a
    // tap: leave recording running until the next tap.
    if (Date.now() - pressInAt.current >= HOLD_THRESHOLD_MS) {
      finishRecording();
    }
  }, [finishRecording]);

  const clear = useCallback(() => {
    setText("");
    setPartial("");
    setCopied(false);
  }, []);

  const copy = useCallback(async () => {
    await Clipboard.setStringAsync(text);
    setCopied(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTimeout(() => setCopied(false), 1800);
  }, [text]);

  const share = useCallback(() => {
    void Share.share({ message: text });
  }, [text]);

  const status =
    micState === "recording"
      ? "Listening"
      : micState === "finalizing"
        ? "Polishing"
        : text
          ? "Tap to keep dictating"
          : "Hold or tap to speak";

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <ThemedText type="eyebrow" themeColor="mutedForeground">
            Freestyle
          </ThemedText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Settings"
            onPress={() => router.push("/(app)/settings")}
            hitSlop={12}
            style={[styles.settingsButton, { borderColor: theme.border }]}
          >
            <SettingsGlyph color={theme.mutedForeground} size={18} />
          </Pressable>
        </View>

        <TranscriptView
          text={text}
          partial={partial}
          placeholder="Your words will appear here."
        />

        {text && micState === "idle" ? (
          <View style={styles.actions}>
            <Pressable
              onPress={copy}
              style={[styles.action, { backgroundColor: theme.primary }]}
            >
              <ThemedText
                style={[styles.actionText, { color: theme.primaryForeground }]}
              >
                {copied ? "Copied" : "Copy"}
              </ThemedText>
            </Pressable>
            <Pressable
              onPress={share}
              style={[styles.actionOutline, { borderColor: theme.border }]}
            >
              <ThemedText style={styles.actionText}>Share</ThemedText>
            </Pressable>
            <Pressable
              onPress={clear}
              style={[styles.actionOutline, { borderColor: theme.border }]}
            >
              <ThemedText style={styles.actionText}>Clear</ThemedText>
            </Pressable>
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
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
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
  settingsButton: {
    width: 38,
    height: 38,
    borderRadius: Radius.full,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  actions: {
    flexDirection: "row",
    gap: Spacing.two,
    paddingVertical: Spacing.two,
  },
  action: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two + 2,
    borderRadius: Radius.full,
  },
  actionOutline: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two + 2,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  actionText: { fontFamily: Fonts.sansMedium, fontSize: 13 },
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
