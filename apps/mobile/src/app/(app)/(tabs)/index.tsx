import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { useIsFocused, useLocalSearchParams, useRouter } from "expo-router";
import { ArrowUp, Menu, Mic, Square } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ChatSidebar } from "@/components/chat-sidebar";
import { MicButton } from "@/components/mic-button";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { TranscriptView } from "@/components/transcript-view";
import { Waveform } from "@/components/waveform";
import { Fonts, Layout, Radius, Spacing } from "@/constants/theme";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/hooks/use-theme";
import { useDictation } from "@/lib/audio/use-dictation";
import { DEFAULT_HOME_MODE } from "@/lib/remix/home-mode";
import type { RemixMode } from "@/lib/remix/types";
import { useRemixThread } from "@/lib/remix/use-remix-thread";

export default function VoiceScreen() {
  const theme = useTheme();
  const { signedIn } = useAuth();
  const router = useRouter();
  // This home screen stays mounted while the resident keyboard session runs in the
  // background provider. Gate its mic on focus so the Home recorder can't fight
  // the resident session for the audio session (two active recorders = "Could
  // not start the microphone").
  const focused = useIsFocused();

  const [mode, setMode] = useState<RemixMode>(DEFAULT_HOME_MODE);
  const [text, setText] = useState("");
  const [copied, setCopied] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Keep this mounted across the Home switch. In particular, switching to
  // Dictate must not discard a running Remix turn or its durable thread.
  const remixThread = useRemixThread();

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

  const startNewChat = useCallback(() => {
    router.setParams({ threadId: undefined });
    remixThread.newThread();
    setMode("remix");
  }, [remixThread, router]);

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
            <Pressable
              onPress={() => setSidebarOpen(true)}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Open sessions"
              style={[styles.menuButton, { borderColor: theme.border }]}
            >
              <Menu color={theme.foreground} size={20} />
            </Pressable>
            <View style={styles.menuSpacer} />
          </View>

          <ModeSwitch mode={mode} onChange={setMode} />

          {mode === "remix" ? (
            <RemixHome
              thread={remixThread}
              onSwitchToDictate={() => setMode("dictate")}
            />
          ) : (
            <>
              <TranscriptView
                text={text}
                partial={partial}
                placeholder="Start speaking and your words will appear here."
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
      <ChatSidebar
        visible={sidebarOpen}
        currentThreadId={remixThread.threadId}
        onClose={() => setSidebarOpen(false)}
        onNewChat={startNewChat}
      />
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

function RemixHome({
  thread,
  onSwitchToDictate,
}: {
  thread: ReturnType<typeof useRemixThread>;
  onSwitchToDictate: () => void;
}) {
  const theme = useTheme();
  const { threadId: selectedThreadId } = useLocalSearchParams<{
    threadId?: string;
  }>();
  const { messages, status, error, activeTool, send, stop, loadThread } =
    thread;
  const [draft, setDraft] = useState("");
  const inputRef = useRef<TextInput>(null);
  const busy = status === "streaming";
  const hasDraft = draft.trim().length > 0;

  useEffect(() => {
    if (selectedThreadId) void loadThread(selectedThreadId);
  }, [loadThread, selectedThreadId]);

  // A fresh session is an input-first surface: focus both on first launch and
  // after creating a new chat, even though the existing TextInput stays mounted.
  useEffect(() => {
    if (messages.length > 0) return;
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [messages.length]);

  const submit = useCallback(async () => {
    const sent = await send(draft);
    if (sent) setDraft("");
  }, [draft, send]);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.remixHome}
    >
      <ScrollView
        style={styles.remixScrollArea}
        contentContainerStyle={styles.remixScroll}
        keyboardShouldPersistTaps="handled"
      >
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
          ref={inputRef}
          value={draft}
          onChangeText={setDraft}
          editable={!busy}
          autoFocus={messages.length === 0}
          autoCapitalize="sentences"
          placeholder="Message Remix"
          placeholderTextColor={theme.mutedForeground}
          multiline
          style={[styles.input, { color: theme.foreground }]}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            busy
              ? "Stop Remix"
              : hasDraft
                ? "Send to Remix"
                : "Switch to Dictate"
          }
          onPress={
            busy ? stop : hasDraft ? () => void submit() : onSwitchToDictate
          }
          style={[
            styles.send,
            {
              backgroundColor:
                hasDraft || busy ? theme.primary : theme.secondary,
            },
          ]}
        >
          {busy ? (
            <Square
              color={theme.primaryForeground}
              fill={theme.primaryForeground}
              size={15}
            />
          ) : hasDraft ? (
            <ArrowUp
              color={theme.primaryForeground}
              size={19}
              strokeWidth={2.5}
            />
          ) : (
            <Mic color={theme.foreground} size={20} />
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
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
    minHeight: 52,
    paddingTop: Spacing.one,
    paddingBottom: Spacing.one,
  },
  menuButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: Radius.full,
  },
  menuSpacer: { width: 40, height: 40 },
  modeSwitch: {
    flexDirection: "row",
    alignSelf: "center",
    position: "absolute",
    top: Spacing.one,
    left: 0,
    right: 0,
    width: 218,
    padding: Spacing.half,
    borderRadius: Radius.full,
    marginBottom: 0,
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
    gap: Spacing.two,
    paddingBottom: Spacing.three,
  },
  remixScrollArea: { flex: 1, minHeight: 0 },
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
    borderRadius: Radius["2xl"],
    padding: Spacing.two,
    minHeight: 64,
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
    textAlignVertical: "center",
  },
  send: {
    width: 44,
    height: 44,
    borderRadius: Radius.full,
    alignItems: "center",
    justifyContent: "center",
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
  footer: {
    alignItems: "center",
    gap: Spacing.three,
    // The home screen owns no tab dock. Keep the control close to the bottom
    // safe area so Dictate reads as a deliberate voice surface, not a floating
    // control stranded above an obsolete navigation bar.
    paddingBottom: Spacing.four,
  },
  status: {
    fontFamily: Fonts.mono,
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
});
