import type { UIMessage } from "ai";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { useIsFocused, useLocalSearchParams, useRouter } from "expo-router";
import {
  ArrowRight,
  ArrowUp,
  Check,
  Copy,
  Menu,
  Mic,
  Pencil,
  RefreshCw,
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
import { MobileConnectSuggestions } from "@/components/mobile-connect-suggestions";
import { MobileMarkdown } from "@/components/mobile-markdown";
import { MobileToolActivity } from "@/components/mobile-tool-activity";
import { RemixWorkingIndicator } from "@/components/remix-working-indicator";
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
  mergeHydratedRemixDrafts,
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
  const transcriptRef = useRef<ScrollView>(null);
  const pendingThreadEndScrollRef = useRef<string | null>(null);
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
        // A voice final (or typed input) may arrive before AsyncStorage. Keep
        // that newer in-memory draft instead of replacing it with stale data.
        const next = mergeHydratedRemixDrafts(stored, draftsRef.current);
        draftsRef.current = next;
        setDrafts(next);
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
    if (!selectedThreadId) return;
    pendingThreadEndScrollRef.current = selectedThreadId;
    void loadThread(selectedThreadId).then((loaded) => {
      if (!loaded && pendingThreadEndScrollRef.current === selectedThreadId) {
        pendingThreadEndScrollRef.current = null;
      }
    });
  }, [loadThread, selectedThreadId]);

  // A selected sidebar session should begin at its newest turn. This is scoped
  // to the initial load only—later streamed changes must never pull someone
  // away from an older message they are reading.
  useEffect(() => {
    if (
      messages.length === 0 ||
      pendingThreadEndScrollRef.current !== thread.threadId
    ) {
      return;
    }
    pendingThreadEndScrollRef.current = null;
    const frame = requestAnimationFrame(() => {
      transcriptRef.current?.scrollToEnd({ animated: false });
    });
    return () => cancelAnimationFrame(frame);
  }, [messages.length, thread.threadId]);

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
    // A durable turn continues after acceptance (for streaming, approvals, or
    // desktop work). Clear the controlled field at that acceptance boundary,
    // rather than making the user's sent draft linger until the turn ends.
    // If the initial request fails, this callback is never reached and the
    // draft remains available to retry.
    const clearAcceptedDraft = () => {
      setDraft("");
      setEditingMessage(null);
    };
    if (editingCurrentThread && editingMessage) {
      await resend(editingMessage.id, draft, clearAcceptedDraft);
    } else {
      await send(draft, clearAcceptedDraft);
    }
  }, [draft, editingCurrentThread, editingMessage, resend, send, setDraft]);

  const copyMessage = useCallback(async (text: string) => {
    await Clipboard.setStringAsync(text);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const sendStarter = useCallback(
    (prompt: string) => {
      void send(prompt, () => setDraft(""));
    },
    [send, setDraft],
  );

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
        ref={transcriptRef}
        style={styles.remixScrollArea}
        contentContainerStyle={[
          styles.remixScroll,
          messages.length === 0 && styles.remixScrollEmpty,
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {messages.length === 0 && !activeTool && !pendingApproval && !error ? (
          <StarterPrompts busy={busy} onPrompt={sendStarter} />
        ) : null}
        {messages.map((message, index) => {
          const actions = (
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
          );

          if (message.role === "user") {
            return (
              <View key={message.id} style={styles.userMessageGroup}>
                <View
                  style={[
                    styles.userTurn,
                    { backgroundColor: theme.secondary },
                  ]}
                >
                  <ThemedText style={styles.userMessage}>
                    {messageText(message)}
                  </ThemedText>
                </View>
                {actions}
              </View>
            );
          }

          return (
            <View key={message.id} style={styles.assistantTurn}>
              <AssistantMessageContent message={message} />
              {actions}
            </View>
          );
        })}
        {activeTool ? <RemixWorkingIndicator label={activeTool} /> : null}
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
              voiceState === "recording" || voiceState === "starting"
                ? theme.primary
                : theme.border,
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
              {voiceState === "starting"
                ? "Starting microphone"
                : voiceState === "recording"
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
            underlineColorAndroid="transparent"
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
            accessibilityHint={
              voiceControl.action === "stop-remix"
                ? "Stops this Remix response and cancels its server turn."
                : undefined
            }
            disabled={
              Boolean(
                pendingApproval &&
                  !["approved", "declined"].includes(approvalState),
              ) ||
              voiceControl.action === "waiting-for-transcript" ||
              voiceControl.action === "waiting-for-microphone"
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
            ) : voiceState === "starting" ? (
              <ActivityIndicator color={theme.mutedForeground} size="small" />
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

const STARTER_PROMPTS = [
  "Look this up and keep it short",
  "Help me draft a message I've been putting off",
  "Remember something about how I work",
] as const;

function StarterPrompts({
  busy,
  onPrompt,
}: {
  busy: boolean;
  onPrompt: (prompt: string) => void;
}) {
  const theme = useTheme();
  return (
    <View style={styles.starters}>
      <ThemedText type="eyebrow" themeColor="mutedForeground">
        START HERE
      </ThemedText>
      <View style={styles.starterList}>
        {STARTER_PROMPTS.map((prompt) => (
          <Pressable
            key={prompt}
            accessibilityRole="button"
            accessibilityLabel={prompt}
            disabled={busy}
            onPress={() => onPrompt(prompt)}
            style={({ pressed }) => [
              styles.starter,
              { backgroundColor: theme.card, borderColor: theme.border },
              pressed && styles.pressed,
            ]}
          >
            <View
              style={[styles.starterMark, { backgroundColor: theme.accent }]}
            >
              <ThemedText
                style={[styles.starterMarkText, { color: theme.primary }]}
              >
                ✦
              </ThemedText>
            </View>
            <ThemedText style={styles.starterText}>{prompt}</ThemedText>
            <ArrowRight color={theme.mutedForeground} size={16} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function AssistantMessageContent({ message }: { message: UIMessage }) {
  return (
    <View style={styles.assistantMessageContent}>
      {message.parts.map((part, index) => {
        if (part.type === "text") {
          const text = part.text?.trim();
          return text ? <MobileMarkdown key={index} text={text} /> : null;
        }
        if (part.type === "tool-suggest_connections") {
          const tool = part as { state?: string; output?: unknown };
          return tool.state === "output-available" ? (
            <MobileConnectSuggestions key={index} output={tool.output} />
          ) : null;
        }
        if (part.type.startsWith("tool-")) {
          const previous = message.parts[index - 1];
          if (
            previous?.type.startsWith("tool-") &&
            previous.type !== "tool-suggest_connections"
          ) {
            return null;
          }
          const group: UIMessage["parts"] = [];
          for (const candidate of message.parts.slice(index)) {
            if (
              !candidate.type.startsWith("tool-") ||
              candidate.type === "tool-suggest_connections"
            ) {
              break;
            }
            group.push(candidate);
          }
          return <MobileToolActivity key={index} parts={group} />;
        }
        return null;
      })}
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
    <View
      style={[
        styles.messageActions,
        message.role === "user" && styles.userMessageActions,
      ]}
    >
      <Pressable
        onPress={() => void onCopy(text)}
        accessibilityRole="button"
        accessibilityLabel="Copy message"
        style={({ pressed }) => [
          styles.messageAction,
          pressed && styles.pressed,
        ]}
      >
        <Copy color={theme.mutedForeground} size={15} />
      </Pressable>
      {message.role === "user" ? (
        <Pressable
          onPress={() => onEdit(text)}
          accessibilityRole="button"
          accessibilityLabel="Edit and resend message"
          style={({ pressed }) => [
            styles.messageAction,
            pressed && styles.pressed,
          ]}
        >
          <Pencil color={theme.mutedForeground} size={15} />
        </Pressable>
      ) : isLatest ? (
        <Pressable
          onPress={onRegenerate}
          accessibilityRole="button"
          accessibilityLabel="Regenerate last Remix response"
          style={({ pressed }) => [
            styles.messageAction,
            pressed && styles.pressed,
          ]}
        >
          <RefreshCw color={theme.mutedForeground} size={15} />
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
  remixScroll: { gap: Spacing.four, paddingBottom: Spacing.three },
  remixScrollEmpty: {
    flexGrow: 1,
    justifyContent: "center",
    paddingBottom: Spacing.five,
  },
  userTurn: {
    alignSelf: "stretch",
    borderRadius: Radius.xl,
    borderBottomRightRadius: Radius.sm,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
  },
  userMessageGroup: {
    alignSelf: "flex-end",
    maxWidth: "84%",
    gap: Spacing.half,
  },
  userMessage: { fontFamily: Fonts.sans, fontSize: 15, lineHeight: 22 },
  assistantTurn: { alignSelf: "stretch", gap: Spacing.one },
  assistantMessageContent: { gap: Spacing.two },
  messageActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.one,
    paddingTop: Spacing.half,
  },
  userMessageActions: { alignSelf: "flex-end" },
  messageAction: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: Radius.md,
  },
  starters: { gap: Spacing.two, alignSelf: "stretch" },
  starterList: { gap: Spacing.two },
  starter: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.three,
  },
  starterMark: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: Radius.sm,
  },
  starterMarkText: { fontFamily: Fonts.sansSemiBold, fontSize: 12 },
  starterText: { flex: 1, fontFamily: Fonts.sansMedium, fontSize: 14 },
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
    minWidth: 0,
    width: "100%",
    fontFamily: Fonts.sans,
    fontSize: 15,
    lineHeight: 21,
    paddingHorizontal: Spacing.one,
    paddingVertical: 10,
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
