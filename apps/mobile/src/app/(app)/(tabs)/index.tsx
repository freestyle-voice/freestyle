import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { useIsFocused, useLocalSearchParams, useRouter } from "expo-router";
import {
  ArrowUp,
  Check,
  Menu,
  Mic,
  Settings,
  Square,
  X,
} from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

import { ChatSidebar } from "@/components/chat-sidebar";
import { MicButton } from "@/components/mic-button";
import { MobileMarkdown } from "@/components/mobile-markdown";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { TranscriptView } from "@/components/transcript-view";
import { Waveform } from "@/components/waveform";
import { Fonts, Layout, Radius, Spacing } from "@/constants/theme";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/hooks/use-theme";
import { useDictation } from "@/lib/audio/use-dictation";
import { composerBottomPadding } from "@/lib/composer-spacing";
import {
  REMIX_COMPOSER_MAX_INPUT_HEIGHT,
  REMIX_COMPOSER_MIN_INPUT_HEIGHT,
  remixComposerInputHeight,
} from "@/lib/remix/composer-sizing";
import {
  appendVoiceTranscript,
  remixComposerVoiceState,
} from "@/lib/remix/composer-voice-state";
import { DEFAULT_HOME_MODE } from "@/lib/remix/home-mode";
import type { RemixMode } from "@/lib/remix/types";
import { useRemixThread } from "@/lib/remix/use-remix-thread";

export default function VoiceScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { signedIn } = useAuth();
  const router = useRouter();
  const { width } = useWindowDimensions();
  // This home screen stays mounted while the resident keyboard session runs in the
  // background provider. Gate its mic on focus so the Home recorder can't fight
  // the resident session for the audio session (two active recorders = "Could
  // not start the microphone").
  const focused = useIsFocused();

  const [mode, setMode] = useState<RemixMode>(DEFAULT_HOME_MODE);
  const [text, setText] = useState("");
  const [copied, setCopied] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const sidebarProgress = useRef(new Animated.Value(0)).current;
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

  const openSidebar = useCallback(() => {
    Keyboard.dismiss();
    setSidebarOpen(true);
  }, []);

  const openSettings = useCallback(() => {
    Keyboard.dismiss();
    router.push("/(app)/profile");
  }, [router]);

  useEffect(() => {
    const showEvent =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSubscription = Keyboard.addListener(showEvent, () =>
      setKeyboardVisible(true),
    );
    const hideSubscription = Keyboard.addListener(hideEvent, () =>
      setKeyboardVisible(false),
    );

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  const sidebarPanelWidth = Math.min(360, Math.round(width * 0.88));
  useEffect(() => {
    Animated.timing(sidebarProgress, {
      toValue: sidebarOpen ? sidebarPanelWidth - Spacing.two : 0,
      duration: sidebarOpen ? 220 : 180,
      useNativeDriver: true,
    }).start();
  }, [sidebarOpen, sidebarPanelWidth, sidebarProgress]);

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
      <Animated.View
        style={[
          styles.appCanvas,
          { transform: [{ translateX: sidebarProgress }] },
        ]}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.keyboardAvoiding}
        >
          <SafeAreaView
            edges={["top", "left", "right"]}
            style={styles.safeArea}
          >
            <View style={styles.column}>
              <View style={styles.header}>
                <Pressable
                  onPress={openSidebar}
                  hitSlop={12}
                  accessibilityRole="button"
                  accessibilityLabel="Open sessions"
                  style={[styles.menuButton, { borderColor: theme.border }]}
                >
                  <Menu color={theme.foreground} size={20} />
                </Pressable>
                <ModeSwitch mode={mode} onChange={setMode} />
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

              {mode === "remix" ? (
                <RemixHome
                  thread={remixThread}
                  signedIn={signedIn && focused}
                  keyboardVisible={keyboardVisible}
                  bottomInset={insets.bottom}
                />
              ) : (
                <>
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
                          Speak naturally. Freestyle keeps the words clear and
                          ready to use.
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
                        style={[
                          styles.action,
                          { backgroundColor: theme.primary },
                        ]}
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
                      <Waveform
                        level={level}
                        active={micState === "recording"}
                      />
                      <ThemedText
                        themeColor="mutedForeground"
                        style={styles.status}
                      >
                        {status}
                      </ThemedText>
                    </View>
                  </View>
                </>
              )}
            </View>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Animated.View>
      <ChatSidebar
        visible={sidebarOpen}
        mode={mode}
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
  signedIn,
  keyboardVisible,
  bottomInset,
}: {
  thread: ReturnType<typeof useRemixThread>;
  signedIn: boolean;
  keyboardVisible: boolean;
  bottomInset: number;
}) {
  const theme = useTheme();
  const { threadId: selectedThreadId } = useLocalSearchParams<{
    threadId?: string;
  }>();
  const {
    messages,
    status,
    error,
    activeTool,
    pendingApproval,
    approvalState,
    decideApproval,
    send,
    stop,
    loadThread,
  } = thread;
  const [draft, setDraft] = useState("");
  const [inputHeight, setInputHeight] = useState(
    REMIX_COMPOSER_MIN_INPUT_HEIGHT,
  );
  const inputRef = useRef<TextInput>(null);
  const busy = status === "streaming";
  const hasDraft = draft.trim().length > 0;
  const {
    micState: voiceState,
    partial: voicePartial,
    toggle: toggleVoiceInput,
  } = useDictation({
    signedIn,
    onFinal: (transcript) => {
      setDraft((current) => appendVoiceTranscript(current, transcript));
      requestAnimationFrame(() => inputRef.current?.focus());
    },
  });
  const voiceControl = remixComposerVoiceState({
    draft,
    partial: voicePartial,
    micState: voiceState,
    remixBusy: busy,
  });

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

  const handleComposerAction = useCallback(() => {
    switch (voiceControl.action) {
      case "stop-remix":
        stop();
        break;
      case "send":
        void submit();
        break;
      case "listen":
      case "finish-listening":
        toggleVoiceInput();
        // Do not dismiss or swap out the field here. The keyboard remains
        // available while the microphone streams, just like a native chat
        // composer, and dictated text appends to the same draft when ready.
        requestAnimationFrame(() => inputRef.current?.focus());
        break;
      case "waiting-for-transcript":
        break;
    }
  }, [stop, submit, toggleVoiceInput, voiceControl.action]);

  const onInputContentSizeChange = useCallback(
    ({ nativeEvent }: { nativeEvent: { contentSize: { height: number } } }) => {
      setInputHeight(remixComposerInputHeight(nativeEvent.contentSize.height));
    },
    [],
  );

  return (
    <View
      style={[
        styles.remixHome,
        {
          paddingBottom: composerBottomPadding({
            keyboardVisible,
            bottomInset,
          }),
        },
      ]}
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
            <MobileMarkdown
              text={message.parts
                .filter((part) => part.type === "text")
                .map((part) => part.text)
                .join("")}
            />
          </View>
        ))}
        {activeTool ? (
          <ThemedText themeColor="mutedForeground" style={styles.toolStatus}>
            {activeTool}…
          </ThemedText>
        ) : null}
        {pendingApproval ? (
          <ConnectorApprovalCard
            approval={pendingApproval}
            state={approvalState}
            onDecide={decideApproval}
          />
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
          {
            backgroundColor: theme.card,
            borderColor:
              voiceState === "recording" ? theme.destructive : theme.border,
          },
        ]}
      >
        <TextInput
          ref={inputRef}
          value={voiceControl.value}
          onChangeText={setDraft}
          editable={
            !busy &&
            !(
              pendingApproval &&
              !["approved", "declined"].includes(approvalState)
            )
          }
          autoCapitalize="sentences"
          placeholder={voiceControl.placeholder}
          placeholderTextColor={theme.mutedForeground}
          multiline
          scrollEnabled={inputHeight >= REMIX_COMPOSER_MAX_INPUT_HEIGHT}
          onContentSizeChange={onInputContentSizeChange}
          style={[
            styles.input,
            { color: theme.foreground, height: inputHeight },
          ]}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={voiceControl.label}
          disabled={
            Boolean(
              pendingApproval &&
                !["approved", "declined"].includes(approvalState),
            ) || voiceControl.action === "waiting-for-transcript"
          }
          onPress={handleComposerAction}
          style={[
            styles.send,
            {
              backgroundColor:
                voiceState === "recording"
                  ? theme.destructive
                  : hasDraft || busy
                    ? theme.primary
                    : theme.secondary,
            },
          ]}
        >
          {busy || voiceState === "recording" ? (
            <Square
              color={
                voiceState === "recording"
                  ? theme.foreground
                  : theme.primaryForeground
              }
              fill={
                voiceState === "recording"
                  ? theme.foreground
                  : theme.primaryForeground
              }
              size={15}
            />
          ) : hasDraft ? (
            <ArrowUp
              color={theme.primaryForeground}
              size={19}
              strokeWidth={2.5}
            />
          ) : (
            <Mic
              color={
                voiceState === "finalizing"
                  ? theme.mutedForeground
                  : theme.foreground
              }
              size={20}
            />
          )}
        </Pressable>
      </View>
    </View>
  );
}

function ConnectorApprovalCard({
  approval,
  state,
  onDecide,
}: {
  approval: import("@/lib/remix/types").PendingConnectorApproval;
  state:
    | "idle"
    | "approving"
    | "approved"
    | "declining"
    | "declined"
    | "failed";
  onDecide: (approved: boolean) => Promise<boolean>;
}) {
  const theme = useTheme();
  const resolved = state === "approved" || state === "declined";
  return (
    <View
      style={[
        styles.approvalCard,
        { backgroundColor: theme.secondary, borderColor: theme.border },
      ]}
    >
      <ThemedText type="eyebrow" themeColor="mutedForeground">
        CONNECTED APP ACTION
      </ThemedText>
      <ThemedText style={styles.approvalTitle}>
        {state === "approved"
          ? "Action approved"
          : state === "declined"
            ? "Action declined"
            : `Allow ${approval.toolkitName}?`}
      </ThemedText>
      <ThemedText themeColor="mutedForeground" style={styles.approvalHint}>
        {state === "approved"
          ? "Freestyle sent this action to your connected account."
          : state === "declined"
            ? "Nothing was changed."
            : `Review this action before Freestyle sends it: ${approval.actionDescription}.`}
      </ThemedText>
      {resolved ? (
        <View style={styles.approvalResolved}>
          {state === "approved" ? (
            <Check color={theme.primary} size={18} />
          ) : (
            <X color={theme.mutedForeground} size={18} />
          )}
        </View>
      ) : (
        <View style={styles.approvalActions}>
          <Pressable
            onPress={() => void onDecide(false)}
            disabled={state !== "idle" && state !== "failed"}
            style={[styles.approvalDecline, { borderColor: theme.border }]}
          >
            <ThemedText style={styles.approvalDeclineText}>Decline</ThemedText>
          </Pressable>
          <Pressable
            onPress={() => void onDecide(true)}
            disabled={state !== "idle" && state !== "failed"}
            style={[styles.approvalAllow, { backgroundColor: theme.primary }]}
          >
            {state === "approving" ? (
              <ActivityIndicator color={theme.primaryForeground} size="small" />
            ) : (
              <ThemedText
                style={[
                  styles.approvalAllowText,
                  { color: theme.primaryForeground },
                ]}
              >
                Allow
              </ThemedText>
            )}
          </Pressable>
        </View>
      )}
    </View>
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
  keyboardAvoiding: { flex: 1 },
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
  modeSwitch: {
    flexDirection: "row",
    width: 218,
    padding: Spacing.half,
    borderRadius: Radius.full,
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
  },
  remixScrollArea: { flex: 1, minHeight: 0 },
  remixScroll: { gap: Spacing.two, paddingBottom: Spacing.two },
  turn: {
    gap: Spacing.one,
    borderWidth: 1,
    borderRadius: Radius.xl,
    padding: Spacing.three,
  },
  toolStatus: {
    fontFamily: Fonts.mono,
    fontSize: 11,
    paddingHorizontal: Spacing.one,
  },
  approvalCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.xl,
    marginTop: Spacing.two,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  approvalTitle: { fontFamily: Fonts.sansSemiBold, fontSize: 17 },
  approvalHint: { fontSize: 14, lineHeight: 20 },
  approvalActions: {
    flexDirection: "row",
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  approvalDecline: {
    flex: 1,
    height: 42,
    borderWidth: 1,
    borderRadius: Radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  approvalDeclineText: { fontFamily: Fonts.sansMedium, fontSize: 14 },
  approvalAllow: {
    flex: 1,
    height: 42,
    borderRadius: Radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  approvalAllowText: { fontFamily: Fonts.sansSemiBold, fontSize: 14 },
  approvalResolved: { alignItems: "flex-start", paddingTop: Spacing.one },
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
