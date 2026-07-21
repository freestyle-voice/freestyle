import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { MicButton } from "@/components/mic-button";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { TranscriptView } from "@/components/transcript-view";
import { Waveform } from "@/components/waveform";
import { Fonts, Radius, Spacing } from "@/constants/theme";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/hooks/use-theme";
import { useDictation } from "@/lib/audio/use-dictation";
import { setPendingTranscript } from "@/lib/keyboard-bridge";

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

  const [result, setResult] = useState("");

  const { micState, partial, level, toggle } = useDictation({
    signedIn,
    autoStart: true,
    onRecordingStart: () => setResult(""),
    onFinal: (text) => {
      setResult(text);
      // Hand the transcript to the keyboard for insertion.
      setPendingTranscript(text);
    },
  });

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
          <Pressable onPress={() => router.back()} hitSlop={12}>
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
