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
import { Fonts, Layout, Radius, Spacing } from "@/constants/theme";
import { useAuth } from "@/hooks/use-auth";
import { useResponsive } from "@/hooks/use-responsive";
import { useTheme } from "@/hooks/use-theme";
import { useDictation } from "@/lib/audio/use-dictation";
import { DEFAULT_HOME_MODE } from "@/lib/remix/home-mode";
import type { RemixMode } from "@/lib/remix/types";

export default function VoiceScreen() {
  const theme = useTheme();
  const { signedIn } = useAuth();
  const { brandSize } = useResponsive();
  // This tab stays mounted while the resident keyboard session runs in the
  // background provider. Gate its mic on focus so the Home recorder can't fight
  // the resident session for the audio session (two active recorders = "Could
  // not start the microphone").
  const focused = useIsFocused();

  const [mode, setMode] = useState<RemixMode>(DEFAULT_HOME_MODE);
  const [text, setText] = useState("");
  const [copied, setCopied] = useState(false);

  const { micState, partial, level, onPressIn, onPressOut } = useDictation({
    signedIn: signedIn && focused && mode === "dictate",
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
        <View style={styles.column}>
          <View style={styles.header}>
            <ThemedText
              type="title"
              style={[
                styles.brand,
                { fontSize: brandSize, lineHeight: brandSize + 4 },
              ]}
            >
              Freestyle
            </ThemedText>
            <HeaderActions />
          </View>

          <ModeSwitch mode={mode} onChange={setMode} />

          {mode === "remix" ? (
            <RemixHome />
          ) : (
            <>
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
                      style={[
                        styles.actionText,
                        { color: theme.primaryForeground },
                      ]}
                    >
                      {copied ? "Copied" : "Copy"}
                    </ThemedText>
                  </Pressable>
                  <Pressable
                    onPress={share}
                    style={[
                      styles.actionOutline,
                      { borderColor: theme.border },
                    ]}
                  >
                    <ThemedText style={styles.actionText}>Share</ThemedText>
                  </Pressable>
                  <Pressable
                    onPress={clear}
                    style={[
                      styles.actionOutline,
                      { borderColor: theme.border },
                    ]}
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
            </>
          )}
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

function ModeSwitch({
  mode,
  onChange,
}: {
  mode: RemixMode;
  onChange: (mode: RemixMode) => void;
}) {
  const theme = useTheme();

  return (
    <View
      accessibilityRole="tablist"
      style={[styles.modeSwitch, { backgroundColor: theme.secondary }]}
    >
      {(["remix", "dictate"] as const).map((option) => {
        const selected = option === mode;
        return (
          <Pressable
            key={option}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={
              option === "remix" ? "Remix" : "Voice dictation"
            }
            onPress={() => onChange(option)}
            style={[
              styles.modeOption,
              selected && { backgroundColor: theme.card },
            ]}
          >
            <ThemedText
              style={[
                styles.modeLabel,
                { color: selected ? theme.foreground : theme.mutedForeground },
              ]}
            >
              {option === "remix" ? "Remix" : "Dictate"}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

function RemixHome() {
  const theme = useTheme();

  return (
    <View style={styles.remixHome}>
      <View style={styles.remixHeading}>
        <ThemedText type="title" style={styles.remixTitle}>
          Make the next move.
        </ThemedText>
        <ThemedText themeColor="mutedForeground" style={styles.remixCopy}>
          Ask Remix to shape a message, plan a task, or work with your connected
          apps.
        </ThemedText>
      </View>

      <View
        style={[
          styles.remixState,
          { backgroundColor: theme.card, borderColor: theme.border },
        ]}
      >
        <ThemedText style={styles.remixEyebrow}>REMIX IS READY</ThemedText>
        <ThemedText style={styles.remixStateTitle}>
          Your focused writing partner.
        </ThemedText>
        <ThemedText themeColor="mutedForeground" style={styles.remixDetail}>
          Remix conversations live here. The keyboard keeps its faster,
          voice-first flow.
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, paddingHorizontal: Spacing.four },
  column: {
    flex: 1,
    width: "100%",
    maxWidth: Layout.contentMaxWidth,
    alignSelf: "center" as const,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: Spacing.three,
    paddingBottom: Spacing.two,
  },
  modeSwitch: {
    flexDirection: "row",
    alignSelf: "center",
    width: "100%",
    maxWidth: 320,
    padding: Spacing.half,
    borderRadius: Radius.full,
    marginTop: Spacing.two,
    marginBottom: Spacing.four,
  },
  modeOption: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 38,
    borderRadius: Radius.full,
  },
  modeLabel: { fontFamily: Fonts.sansSemiBold, fontSize: 14 },
  remixHome: {
    flex: 1,
    justifyContent: "space-between",
    paddingBottom: 120,
  },
  remixHeading: { gap: Spacing.two, paddingTop: Spacing.two },
  remixTitle: { fontSize: 42, lineHeight: 46 },
  remixCopy: { fontSize: 16, lineHeight: 24, maxWidth: 350 },
  remixState: {
    gap: Spacing.three,
    borderRadius: Radius.xl,
    borderWidth: 1,
    padding: Spacing.four,
  },
  remixEyebrow: {
    fontFamily: Fonts.mono,
    fontSize: 11,
    letterSpacing: 1.2,
  },
  remixStateTitle: { fontFamily: Fonts.sansSemiBold, fontSize: 19 },
  remixDetail: { fontSize: 14, lineHeight: 21 },
  brand: {},
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
    // Clear the native tab dock and the resident keyboard status strip.
    paddingBottom: 96,
  },
  status: {
    fontFamily: Fonts.mono,
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
});
