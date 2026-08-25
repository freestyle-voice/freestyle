import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { MessageSquarePlus, Search, Trash2 } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { Fonts, Radius, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { useHistory } from "@/lib/history";
import { deleteThread, listThreads } from "@/lib/remix/client";
import { remixQueryKeys } from "@/lib/remix/query";
import type { RemixMode } from "@/lib/remix/types";

const MAX_RECENT_SESSIONS = 24;

type ChatSidebarProps = {
  visible: boolean;
  mode: RemixMode;
  currentThreadId: string;
  onClose: () => void;
  onNewChat: () => void;
};

/**
 * A ChatGPT-style session drawer. Conversations remain the primary navigation;
 * account and utility pages live here instead of competing with the composer in
 * a permanent bottom tab bar.
 */
export function ChatSidebar({
  visible,
  mode,
  currentThreadId,
  onClose,
  onNewChat,
}: ChatSidebarProps) {
  const theme = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { history } = useHistory();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const panelWidth = Math.min(360, Math.round(width * 0.88));
  const [mounted, setMounted] = useState(visible);
  const [search, setSearch] = useState("");
  const progress = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const { data, isLoading } = useQuery({
    queryKey: remixQueryKeys.recentSessions,
    queryFn: () => listThreads({ origin: "user" }),
    enabled: visible,
    // A conversation is typically created just before reopening the drawer;
    // always refresh on open so that new chat is immediately discoverable.
    staleTime: 0,
    retry: 1,
  });

  useEffect(() => {
    if (visible) {
      setMounted(true);
      requestAnimationFrame(() => {
        Animated.timing(progress, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }).start();
      });
      return;
    }
    if (!mounted) return;
    Animated.timing(progress, {
      toValue: 0,
      duration: 180,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setMounted(false);
    });
  }, [mounted, progress, visible]);

  if (!mounted) return null;

  const navigate = (path: "/(app)/history") => {
    onClose();
    router.push(path);
  };
  const selectThread = (id: string) => {
    onClose();
    router.replace({ pathname: "/(app)/(tabs)", params: { threadId: id } });
  };
  const removeThread = (id: string, title: string) => {
    Alert.alert(
      "Delete conversation?",
      `“${title || "Untitled chat"}” will be removed from your history.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void deleteThread(id)
              .then(() => {
                void queryClient.invalidateQueries({
                  queryKey: remixQueryKeys.threads,
                });
                if (id === currentThreadId) onNewChat();
              })
              .catch(() => {
                Alert.alert(
                  "Couldn't delete conversation",
                  "Check your connection and try again.",
                );
              });
          },
        },
      ],
    );
  };
  const startNewChat = () => {
    onNewChat();
    onClose();
  };
  const translateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [-panelWidth, 0],
  });
  const threads = (data?.threads ?? []).filter((thread) =>
    thread.title.toLowerCase().includes(search.trim().toLowerCase()),
  );

  return (
    <Modal
      transparent
      visible={mounted}
      statusBarTranslucent
      animationType="none"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Animated.View
          style={[
            styles.backdrop,
            {
              opacity: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [0, 0.42],
              }),
            },
          ]}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>
        <Animated.View
          style={[
            styles.panel,
            {
              width: panelWidth,
              backgroundColor: theme.background,
              borderColor: theme.border,
              transform: [{ translateX }],
            },
          ]}
        >
          <View
            style={[
              styles.safeArea,
              {
                paddingTop: Math.max(insets.top, Spacing.six) + Spacing.three,
                paddingBottom:
                  Math.max(insets.bottom, Spacing.three) + Spacing.three,
              },
            ]}
          >
            <View style={styles.sessionsLabel}>
              <ThemedText type="eyebrow" themeColor="mutedForeground">
                {mode === "dictate" ? "RECENT DICTATIONS" : "RECENT CHATS"}
              </ThemedText>
            </View>
            {mode === "remix" ? (
              <View
                style={[styles.search, { backgroundColor: theme.secondary }]}
              >
                <Search color={theme.mutedForeground} size={16} />
                <TextInput
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Search conversations"
                  placeholderTextColor={theme.mutedForeground}
                  accessibilityLabel="Search conversations"
                  style={[styles.searchInput, { color: theme.foreground }]}
                  returnKeyType="search"
                />
              </View>
            ) : null}
            <ScrollView
              style={styles.sessionScroll}
              contentContainerStyle={styles.sessionList}
              showsVerticalScrollIndicator={false}
            >
              {mode === "remix" && isLoading ? (
                <ThemedText themeColor="mutedForeground" style={styles.empty}>
                  Loading conversations…
                </ThemedText>
              ) : mode === "remix" && threads.length ? (
                threads.slice(0, MAX_RECENT_SESSIONS).map((thread) => {
                  const selected = thread.id === currentThreadId;
                  return (
                    <View
                      key={thread.id}
                      style={[
                        styles.sessionRow,
                        selected && { backgroundColor: theme.accent },
                      ]}
                    >
                      <Pressable
                        onPress={() => selectThread(thread.id)}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        accessibilityLabel={thread.title || "Untitled chat"}
                        style={({ pressed }) => [
                          styles.session,
                          pressed && styles.pressed,
                        ]}
                      >
                        <ThemedText
                          numberOfLines={1}
                          style={[
                            styles.sessionTitle,
                            selected && { color: theme.accentForeground },
                          ]}
                        >
                          {thread.title || "Untitled chat"}
                        </ThemedText>
                      </Pressable>
                      <Pressable
                        onPress={() => removeThread(thread.id, thread.title)}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel={`Delete ${thread.title || "conversation"}`}
                        style={styles.deleteSession}
                      >
                        <Trash2
                          color={
                            selected
                              ? theme.accentForeground
                              : theme.mutedForeground
                          }
                          size={15}
                        />
                      </Pressable>
                    </View>
                  );
                })
              ) : mode === "dictate" && history.length ? (
                history.slice(0, MAX_RECENT_SESSIONS).map((entry) => (
                  <Pressable
                    key={entry.id}
                    onPress={() => navigate("/(app)/history")}
                    accessibilityRole="button"
                    accessibilityLabel={`View dictation: ${entry.text}`}
                    style={({ pressed }) => [
                      styles.session,
                      pressed && styles.pressed,
                    ]}
                  >
                    <ThemedText numberOfLines={2} style={styles.sessionTitle}>
                      {entry.text}
                    </ThemedText>
                  </Pressable>
                ))
              ) : (
                <View style={styles.emptyState}>
                  <View
                    style={[
                      styles.emptyIcon,
                      { backgroundColor: theme.secondary },
                    ]}
                  >
                    <MessageSquarePlus
                      color={theme.mutedForeground}
                      size={19}
                    />
                  </View>
                  <ThemedText style={styles.emptyTitle}>
                    {mode === "dictate"
                      ? "No dictations yet"
                      : search
                        ? "No matching chats"
                        : "No chats yet"}
                  </ThemedText>
                  <ThemedText themeColor="mutedForeground" style={styles.empty}>
                    {mode === "dictate"
                      ? "Your recent dictations will appear here."
                      : search
                        ? "Try a different search."
                        : "Start a chat and it will stay here for next time."}
                  </ThemedText>
                </View>
              )}
            </ScrollView>

            <View style={styles.footer}>
              <Pressable
                onPress={startNewChat}
                accessibilityRole="button"
                accessibilityLabel="New chat"
                style={({ pressed }) => [
                  styles.newChat,
                  { backgroundColor: theme.primary },
                  pressed && styles.pressed,
                ]}
              >
                <MessageSquarePlus color={theme.primaryForeground} size={20} />
                <ThemedText
                  style={[
                    styles.newChatText,
                    { color: theme.primaryForeground },
                  ]}
                >
                  New chat
                </ThemedText>
              </Pressable>
            </View>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1 },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: "#000" },
  panel: {
    flex: 1,
    borderRightWidth: StyleSheet.hairlineWidth,
    shadowColor: "#000",
    shadowOpacity: 0.28,
    shadowRadius: 20,
    shadowOffset: { width: 8, height: 0 },
    elevation: 10,
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: Spacing.four,
  },
  sessionsLabel: { paddingBottom: Spacing.three },
  search: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.md,
    marginBottom: Spacing.three,
  },
  searchInput: { flex: 1, fontFamily: Fonts.sans, fontSize: 14 },
  sessionScroll: { flex: 1, minHeight: 0 },
  sessionList: { gap: Spacing.half, paddingBottom: Spacing.two },
  sessionRow: {
    minHeight: 42,
    borderRadius: Radius.md,
    flexDirection: "row",
    alignItems: "center",
  },
  session: {
    flex: 1,
    minHeight: 42,
    justifyContent: "center",
    paddingLeft: Spacing.two,
    paddingRight: Spacing.one,
  },
  deleteSession: {
    width: 36,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
  },
  sessionTitle: { fontFamily: Fonts.sansMedium, fontSize: 14 },
  empty: {
    textAlign: "center",
    fontSize: 14,
    lineHeight: 20,
  },
  emptyState: {
    alignItems: "center",
    gap: Spacing.two,
    paddingHorizontal: Spacing.five,
    paddingTop: Spacing.six,
  },
  emptyIcon: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: Radius.full,
    marginBottom: Spacing.one,
  },
  emptyTitle: { fontFamily: Fonts.sansSemiBold, fontSize: 16 },
  footer: { paddingTop: Spacing.three },
  newChat: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.two,
    borderRadius: Radius.full,
  },
  newChatText: { fontFamily: Fonts.sansSemiBold, fontSize: 15 },
  pressed: { opacity: 0.62 },
});
