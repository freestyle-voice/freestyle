import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { useIsFocused, useRouter } from "expo-router";
import { History, Settings } from "lucide-react-native";
import { useCallback, useState } from "react";
import { Keyboard, Pressable, Share, StyleSheet, View } from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { MicButton } from "@/components/mic-button";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { TranscriptView } from "@/components/transcript-view";
import { Waveform } from "@/components/waveform";
import { Fonts, Layout, Radius, Spacing } from "@/constants/theme";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/hooks/use-theme";
import { useDictation } from "@/lib/audio/use-dictation";

export default function VoiceScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { signedIn } = useAuth();
  const router = useRouter();
  // This home screen stays mounted while the resident keyboard session runs in the
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

  const openSettings = useCallback(() => {
    Keyboard.dismiss();
    router.push("/(app)/profile");
  }, [router]);

  const status =
    micState === "starting"
      ? "Starting microphone"
      : micState === "recording"
        ? "Listening"
        : micState === "finalizing"
          ? "Polishing"
          : text
            ? "Tap to keep dictating"
            : "Hold or tap to speak";

  return (
    <ThemedView style={styles.container}>
      <View style={styles.appCanvas}>
        <SafeAreaView edges={["top", "left", "right"]} style={styles.safeArea}>
          <View style={styles.column}>
            <View style={styles.header}>
              <Pressable
                onPress={() => router.push("/(app)/history")}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Open history"
                style={[styles.menuButton, { borderColor: theme.border }]}
              >
                <History color={theme.foreground} size={20} />
              </Pressable>
              <ThemedText type="eyebrow">DICTATE</ThemedText>
              <Pressable
                onPress={openSettings}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Open account and settings"
                style={[styles.settingsButton, { borderColor: theme.border }]}
              >
                <Settings color={theme.foreground} size={19} />
              </Pressable>
            </View>

            <View style={[styles.dictationStage]}>
              <View style={styles.dictationLead}>
                <ThemedText type="eyebrow" themeColor="mutedForeground">
                  DICTATE
                </ThemedText>
                {!text && !partial ? (
                  <ThemedText
                    themeColor="mutedForeground"
                    style={styles.dictationPrompt}
                  >
                    Speak naturally. Freestyle keeps the words clear and ready
                    to use.
                  </ThemedText>
                ) : null}
              </View>
              <TranscriptView
                text={text}
                partial={partial}
                placeholder="Your words will appear here."
              />
            </View>

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

            <View
              style={[
                styles.dictationDock,
                {
                  borderColor: theme.border,
                  paddingBottom: insets.bottom + Spacing.three,
                },
              ]}
            >
              <MicButton
                state={micState}
                size={72}
                level={level}
                onPressIn={onPressIn}
                onPressOut={onPressOut}
              />
              <View style={styles.dictationStatus}>
                <Waveform level={level} active={micState === "recording"} />
                <ThemedText themeColor="mutedForeground" style={styles.status}>
                  {status}
                </ThemedText>
              </View>
            </View>
          </View>
        </SafeAreaView>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  appCanvas: {
    flex: 1,
    overflow: "hidden",
    borderTopLeftRadius: 38,
    borderBottomLeftRadius: 38,
  },
  safeArea: { flex: 1, paddingHorizontal: Spacing.four },
  column: {
    flex: 1,
    width: "100%",
    maxWidth: Layout.contentMaxWidth,
    alignSelf: "center" as const,
  },
  header: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 60,
    paddingTop: Spacing.one,
    paddingBottom: Spacing.two,
  },
  menuButton: {
    position: "absolute",
    left: 0,
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: Radius.full,
  },
  settingsButton: {
    position: "absolute",
    right: 0,
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: Radius.full,
  },
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
  dictationStage: {
    flex: 1,
    minHeight: 0,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.four,
  },
  dictationLead: { gap: Spacing.two, paddingBottom: Spacing.three },
  dictationPrompt: { fontSize: 16, lineHeight: 23, maxWidth: 290 },
  dictationDock: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.three,
    marginTop: Spacing.one,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing.three,
  },
  dictationStatus: {
    alignItems: "flex-start",
    gap: Spacing.one,
    minWidth: 132,
  },
  status: {
    fontFamily: Fonts.mono,
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
});
