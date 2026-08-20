import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { useIsFocused } from "expo-router";
import { useCallback, useState } from "react";
import {
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
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
import { useRemixThread } from "@/lib/remix/use-remix-thread";

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
  const { messages, status, error, activeTool, send, stop, newThread } =
    useRemixThread();
  const [draft, setDraft] = useState("");
  const busy = status === "streaming";

  const submit = useCallback(async () => {
    const sent = await send(draft);
    if (sent) setDraft("");
  }, [draft, send]);

  return (
    <View style={styles.remixHome}>
      <View style={styles.remixTopline}>
        <ThemedText type="title" style={styles.remixTitle}>
          Make the next move.
        </ThemedText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="New conversation"
          onPress={newThread}
          style={[styles.newThread, { borderColor: theme.border }]}
        >
          <ThemedText style={styles.newThreadText}>New</ThemedText>
        </Pressable>
      </View>
      <ScrollView
        contentContainerStyle={styles.remixScroll}
        keyboardShouldPersistTaps="handled"
      >
        {messages.length === 0 ? (
          <View
            style={[
              styles.remixState,
              { backgroundColor: theme.card, borderColor: theme.border },
            ]}
          >
            <ThemedText style={styles.remixEyebrow}>REMIX</ThemedText>
            <ThemedText style={styles.remixStateTitle}>
              Your focused writing partner.
            </ThemedText>
            <ThemedText themeColor="mutedForeground" style={styles.remixDetail}>
              Ask for a draft, a plan, or help working through a task.
            </ThemedText>
          </View>
        ) : null}
        {messages.map((message) => (
          <View
            key={message.id}
            style={[
              styles.turn,
              {
                backgroundColor:
                  message.role === "user" ? theme.secondary : theme.card,
                borderColor: theme.border,
              },
            ]}
          >
            <ThemedText type="eyebrow" themeColor="mutedForeground">
              {message.role === "user" ? "YOU" : "REMIX"}
            </ThemedText>
            <ThemedText style={styles.turnText}>
              {message.parts
                .filter((part) => part.type === "text")
                .map((part) => part.text)
                .join("")}
            </ThemedText>
          </View>
        ))}
        {activeTool ? (
          <ThemedText themeColor="mutedForeground" style={styles.toolStatus}>
            {activeTool}…
          </ThemedText>
        ) : null}
        {error ? (
          <ThemedText style={[styles.error, { color: theme.destructive }]}>
            {error}
          </ThemedText>
        ) : null}
      </ScrollView>
      <View
        style={[
          styles.composer,
          { backgroundColor: theme.card, borderColor: theme.border },
        ]}
      >
        <TextInput
          value={draft}
          onChangeText={setDraft}
          editable={!busy}
          placeholder="Ask Remix anything"
          placeholderTextColor={theme.mutedForeground}
          multiline
          style={[styles.input, { color: theme.foreground }]}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={busy ? "Stop Remix" : "Send to Remix"}
          onPress={busy ? stop : () => void submit()}
          style={[styles.send, { backgroundColor: theme.primary }]}
        >
          <ThemedText style={{ color: theme.primaryForeground }}>
            {busy ? "■" : "↑"}
          </ThemedText>
        </Pressable>
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
    minHeight: 0,
    gap: Spacing.three,
    paddingBottom: 96,
  },
  remixTopline: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.three,
  },
  newThread: {
    minHeight: 40,
    paddingHorizontal: Spacing.three,
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: Radius.full,
  },
  newThreadText: { fontFamily: Fonts.sansSemiBold, fontSize: 13 },
  remixScroll: { gap: Spacing.two, paddingBottom: Spacing.two },
  turn: {
    gap: Spacing.one,
    borderWidth: 1,
    borderRadius: Radius.xl,
    padding: Spacing.three,
  },
  turnText: { fontSize: 15, lineHeight: 22 },
  toolStatus: {
    fontFamily: Fonts.mono,
    fontSize: 11,
    paddingHorizontal: Spacing.one,
  },
  error: { fontSize: 13, lineHeight: 19, paddingHorizontal: Spacing.one },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: Spacing.two,
    borderWidth: 1,
    borderRadius: Radius.xl,
    padding: Spacing.two,
  },
  input: {
    flex: 1,
    minHeight: 38,
    maxHeight: 104,
    fontFamily: Fonts.sans,
    fontSize: 15,
    lineHeight: 21,
    paddingHorizontal: Spacing.one,
    paddingVertical: Spacing.one,
  },
  send: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    alignItems: "center",
    justifyContent: "center",
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
