import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Pressable, Share, StyleSheet, View } from "react-native";
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
  const [level, setLevel] = useState(0);
  const [copied, setCopied] = useState(false);

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
    onLevel: setLevel,
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
    setLevel(0);
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
  }, [recorder, teardownSession]);

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
      ? "Listening — release or tap to finish"
      : micState === "finalizing"
        ? "Polishing your words…"
        : text
          ? "Hold or tap to keep dictating"
          : "Hold or tap to speak";

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <ThemedText type="eyebrow" themeColor="mutedForeground">
            Freestyle
          </ThemedText>
          <Pressable
            onPress={() => router.push("/(app)/settings")}
            hitSlop={12}
          >
            <ThemedText type="eyebrow" themeColor="primary">
              Settings
            </ThemedText>
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
    paddingTop: Spacing.two,
  },
  actions: {
    flexDirection: "row",
    gap: Spacing.two,
    paddingVertical: Spacing.two,
  },
  action: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radius.md,
  },
  actionOutline: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  actionText: { fontFamily: Fonts.sansMedium, fontSize: 13 },
  footer: {
    alignItems: "center",
    gap: Spacing.two,
    paddingBottom: Spacing.four,
  },
  status: { fontSize: 13 },
});
