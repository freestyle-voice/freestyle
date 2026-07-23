import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { useIsFocused } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, Share, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { HeaderActions } from "@/components/header-actions";
import { MicButton } from "@/components/mic-button";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { TranscriptView } from "@/components/transcript-view";
import { Waveform } from "@/components/waveform";
import { Fonts, Radius, Spacing } from "@/constants/theme";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/hooks/use-theme";
import { useDictation } from "@/lib/audio/use-dictation";

export default function VoiceScreen() {
  const theme = useTheme();
  const { signedIn } = useAuth();
  // This tab stays mounted while the resident keyboard session runs in the
  // background provider. Gate its mic on focus so the Home recorder can't fight
  // the resident session for the audio session (two active recorders = "Could
  // not start the microphone").
  const focused = useIsFocused();

  const [text, setText] = useState("");
  const [copied, setCopied] = useState(false);

  const { micState, partial, level, onPressIn, onPressOut } = useDictation({
    signedIn: signedIn && focused,
    onRecordingStart: () => setCopied(false),
    onFinal: (t) => setText((prev) => (prev ? `${prev} ${t}` : t)),
  });

  const clear = useCallback(() => {
    setText("");
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
          <ThemedText type="title" style={styles.brand}>
            Freestyle
          </ThemedText>
          <HeaderActions />
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
            onPressIn={onPressIn}
            onPressOut={onPressOut}
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
  brand: { fontSize: 30, lineHeight: 34 },
  actions: {
    flexDirection: "row",
    justifyContent: "center",
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
    // Sit just above the docked tab bar (bar + raised mic + safe inset).
    paddingBottom: 120,
  },
  status: {
    fontFamily: Fonts.mono,
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
});
