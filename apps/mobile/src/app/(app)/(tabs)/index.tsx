import type { UIMessage } from "ai";
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
import {
  loadRemixDrafts,
  type RemixDrafts,
  saveRemixDrafts,
  updateRemixDraft,
} from "@/lib/remix/drafts";
import { DEFAULT_HOME_MODE } from "@/lib/remix/home-mode";
import { messageText } from "@/lib/remix/thread";
import type { RemixMode } from "@/lib/remix/types";
import { useRemixThread } from "@/lib/remix/use-remix-thread";

export default function VoiceScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { signedIn, user } = useAuth();
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
                  userId={user?.id}
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
  userId,
  keyboardVisible,
  bottomInset,
}: {
  thread: ReturnType<typeof useRemixThread>;
  signedIn: boolean;
  userId: string | undefined;
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
    resend,
    retryLastTurn,
    stop,
    loadThread,
  } = thread;
  const [drafts, setDrafts] = useState<RemixDrafts>({});
  const draftsRef = useRef<RemixDrafts>({});
  const draftWriteQueue = useRef<Promise<void>>(Promise.resolve());
  const [editingMessage, setEditingMessage] = useState<{
    id: string;
    text: string;
    threadId: string;
  } | null>(null);
  const [inputHeight, setInputHeight] = useState(
    REMIX_COMPOSER_MIN_INPUT_HEIGHT,
  );
  const inputRef = useRef<TextInput>(null);
  const draft = drafts[thread.threadId] ?? "";
  const editingCurrentThread = editingMessage?.threadId === thread.threadId;
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
    micState: voiceState,
    remixBusy: busy,
  });

  useEffect(() => {
    let cancelled = false;
    void loadRemixDrafts(userId)
      .then((stored) => {
        if (cancelled) return;
        draftsRef.current = stored;
        setDrafts(stored);
      })
      .catch(() => {
        // Draft recovery is best-effort. Storage should never block chat.
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const setDraft = useCallback(
    (value: string | ((current: string) => string)) => {
      const current = draftsRef.current[thread.threadId] ?? "";
      const nextValue = typeof value === "function" ? value(current) : value;
      const next = updateRemixDraft(
        draftsRef.current,
        thread.threadId,
        nextValue,
      );
      draftsRef.current = next;
      setDrafts(next);
      draftWriteQueue.current = draftWriteQueue.current
        .catch(() => {})
        .then(() => saveRemixDrafts(userId, next))
        .catch(() => {});
    },
    [thread.threadId, userId],
  );

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

  // iOS does not always emit another content-size event after a controlled
  // multiline field is cleared (for example after Send or a voice final). Keep
  // the next empty draft compact instead of leaving an invisible, stale
  // multi-line input height in the composer.
  useEffect(() => {
    if (!draft) setInputHeight(REMIX_COMPOSER_MIN_INPUT_HEIGHT);
  }, [draft]);

  const submit = useCallback(async () => {
    const sent =
      editingCurrentThread && editingMessage
        ? await resend(editingMessage.id, draft)
        : await send(draft);
    if (sent) {
      setDraft("");
      setEditingMessage(null);
    }
  }, [draft, editingCurrentThread, editingMessage, resend, send, setDraft]);

  const copyMessage = useCallback(async (text: string) => {
    await Clipboard.setStringAsync(text);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

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
      const nextHeight = remixComposerInputHeight(
        nativeEvent.contentSize.height,
      );
      // A rendered height can itself trigger another content-size event on iOS.
      // Avoid turning that feedback into a resize loop that makes long drafts
      // jump while the keyboard is open.
      setInputHeight((currentHeight) =>
        currentHeight === nextHeight ? currentHeight : nextHeight,
      );
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
        {messages.map((message, index) => (
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
            <MobileMarkdown text={messageText(message)} />
            <MessageActions
              message={message}
              isLatest={index === messages.length - 1}
              onCopy={copyMessage}
              onEdit={(text) => {
                setEditingMessage({
                  id: message.id,
                  text,
                  threadId: thread.threadId,
                });
                setDraft(text);
                requestAnimationFrame(() => inputRef.current?.focus());
              }}
              onRegenerate={() => void retryLastTurn()}
            />
          </View>
        ))}
        {activeTool ? (
          <View
            style={[styles.toolStatus, { backgroundColor: theme.secondary }]}
          >
            <ActivityIndicator color={theme.primary} size="small" />
            <ThemedText
              themeColor="mutedForeground"
              style={styles.toolStatusText}
            >
              {activeTool}
            </ThemedText>
          </View>
        ) : null}
        {pendingApproval ? (
          <ConnectorApprovalCard
            approval={pendingApproval}
            state={approvalState}
            onDecide={decideApproval}
          />
        ) : null}
        {error ? (
          <View
            style={[
              styles.recovery,
              { backgroundColor: theme.secondary, borderColor: theme.border },
            ]}
          >
            <ThemedText style={[styles.error, { color: theme.destructive }]}>
              {error}
            </ThemedText>
            <Pressable
              onPress={() => void retryLastTurn()}
              accessibilityRole="button"
              accessibilityLabel="Retry last Remix message"
              style={[styles.retry, { backgroundColor: theme.primary }]}
            >
              <ThemedText
                style={[styles.retryText, { color: theme.primaryForeground }]}
              >
                Retry
              </ThemedText>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>
      {editingCurrentThread ? (
        <View
          style={[styles.editingBanner, { backgroundColor: theme.secondary }]}
        >
          <ThemedText themeColor="mutedForeground" style={styles.editingCopy}>
            Editing an earlier message. Sending will replace the reply after it.
          </ThemedText>
          <Pressable
            onPress={() => {
              setEditingMessage(null);
              setDraft("");
            }}
            accessibilityRole="button"
            accessibilityLabel="Cancel editing message"
          >
            <X color={theme.mutedForeground} size={16} />
          </Pressable>
        </View>
      ) : null}
      <View
        style={[
          styles.composer,
          {
            backgroundColor: theme.card,
            borderColor:
              voiceState === "recording" ? theme.primary : theme.border,
          },
        ]}
      >
        {voiceState !== "idle" ? (
          <View accessibilityLiveRegion="polite" style={styles.voiceStatus}>
            {voiceState === "recording" ? (
              <View
                style={[
                  styles.voiceStatusDot,
                  { backgroundColor: theme.primary },
                ]}
              />
            ) : (
              <ActivityIndicator color={theme.primary} size="small" />
            )}
            <ThemedText
              themeColor="mutedForeground"
              style={styles.voiceStatusText}
              numberOfLines={1}
            >
              {voiceState === "recording"
                ? voicePartial || "Listening"
                : "Adding your voice"}
            </ThemedText>
          </View>
        ) : null}
        <View style={styles.composerInputRow}>
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
                  voiceState === "recording" || hasDraft || busy
                    ? theme.primary
                    : theme.secondary,
              },
            ]}
          >
            {busy || voiceState === "recording" ? (
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
    </View>
  );
}

function MessageActions({
  message,
  isLatest,
  onCopy,
  onEdit,
  onRegenerate,
}: {
  message: UIMessage;
  isLatest: boolean;
  onCopy: (text: string) => Promise<void>;
  onEdit: (text: string) => void;
  onRegenerate: () => void;
}) {
  const theme = useTheme();
  const text = messageText(message);
  if (!text) return null;
  return (
    <View style={styles.messageActions}>
      <Pressable
        onPress={() => void onCopy(text)}
        accessibilityRole="button"
        accessibilityLabel="Copy message"
        style={({ pressed }) => [
          styles.messageAction,
          { borderColor: theme.border },
          pressed && styles.pressed,
        ]}
      >
        <ThemedText
          themeColor="mutedForeground"
          style={styles.messageActionText}
        >
          Copy
        </ThemedText>
      </Pressable>
      {message.role === "user" ? (
        <Pressable
          onPress={() => onEdit(text)}
          accessibilityRole="button"
          accessibilityLabel="Edit and resend message"
          style={({ pressed }) => [
            styles.messageAction,
            { borderColor: theme.border },
            pressed && styles.pressed,
          ]}
        >
          <ThemedText
            themeColor="mutedForeground"
            style={styles.messageActionText}
          >
            Edit
          </ThemedText>
        </Pressable>
      ) : isLatest ? (
        <Pressable
          onPress={onRegenerate}
          accessibilityRole="button"
          accessibilityLabel="Regenerate last Remix response"
          style={({ pressed }) => [
            styles.messageAction,
            { borderColor: theme.border },
            pressed && styles.pressed,
          ]}
        >
          <ThemedText
            themeColor="mutedForeground"
            style={styles.messageActionText}
          >
            Regenerate
          </ThemedText>
        </Pressable>
      ) : null}
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
  messageActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    paddingTop: Spacing.one,
  },
  messageAction: {
    minHeight: 28,
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.two,
  },
  messageActionText: { fontFamily: Fonts.sansMedium, fontSize: 12 },
  toolStatus: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  toolStatusText: { fontFamily: Fonts.sansMedium, fontSize: 13 },
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
  recovery: {
    gap: Spacing.two,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.lg,
    padding: Spacing.three,
  },
  error: { fontSize: 13, lineHeight: 19 },
  retry: {
    alignSelf: "flex-start",
    minHeight: 34,
    justifyContent: "center",
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.three,
  },
  retryText: { fontFamily: Fonts.sansSemiBold, fontSize: 13 },
  editingBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  editingCopy: { flex: 1, fontSize: 12, lineHeight: 17 },
  composer: {
    gap: Spacing.two,
    borderWidth: 1,
    borderRadius: Radius["2xl"],
    padding: Spacing.two,
    minHeight: 60,
  },
  voiceStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    minHeight: 24,
    paddingHorizontal: Spacing.one,
  },
  voiceStatusDot: { width: 8, height: 8, borderRadius: Radius.full },
  voiceStatusText: { flex: 1, fontFamily: Fonts.sansMedium, fontSize: 13 },
  composerInputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: Spacing.two,
  },
  input: {
    flex: 1,
    minHeight: REMIX_COMPOSER_MIN_INPUT_HEIGHT,
    maxHeight: REMIX_COMPOSER_MAX_INPUT_HEIGHT,
    fontFamily: Fonts.sans,
    fontSize: 15,
    lineHeight: 21,
    paddingHorizontal: Spacing.one,
    paddingTop: Spacing.one + 2,
    paddingBottom: Spacing.one + 1,
    textAlignVertical: "top",
  },
  send: {
    width: 44,
    height: 44,
    borderRadius: Radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: { opacity: 0.62 },
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
