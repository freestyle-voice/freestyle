import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { MessageSquarePlus, Settings, X } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { Fonts, Radius, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { useHistory } from "@/lib/history";
import { listThreads } from "@/lib/remix/client";
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
  const { history } = useHistory();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const panelWidth = Math.min(360, Math.round(width * 0.88));
  const [mounted, setMounted] = useState(visible);
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

  const navigate = (path: "/(app)/history" | "/(app)/profile") => {
    onClose();
    router.push(path);
  };
  const selectThread = (id: string) => {
    onClose();
    router.replace({ pathname: "/(app)/(tabs)", params: { threadId: id } });
  };
  const startNewChat = () => {
    onNewChat();
    onClose();
  };
  const translateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [-panelWidth, 0],
  });

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
            <View style={styles.topRow}>
              <ThemedText type="title" style={styles.brand}>
                Freestyle
              </ThemedText>
              <Pressable
                onPress={onClose}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Close sessions"
                style={[styles.close, { borderColor: theme.border }]}
              >
                <X color={theme.foreground} size={18} />
              </Pressable>
            </View>

            <View style={styles.sessionsLabel}>
              <ThemedText type="eyebrow" themeColor="mutedForeground">
                {mode === "dictate" ? "RECENT DICTATIONS" : "RECENT CHATS"}
              </ThemedText>
            </View>
            <ScrollView
              style={styles.sessionScroll}
              contentContainerStyle={styles.sessionList}
              showsVerticalScrollIndicator={false}
            >
              {mode === "remix" && isLoading ? (
                <ThemedText themeColor="mutedForeground" style={styles.empty}>
                  Loading conversations…
                </ThemedText>
              ) : mode === "remix" && data?.threads.length ? (
                data.threads.slice(0, MAX_RECENT_SESSIONS).map((thread) => {
                  const selected = thread.id === currentThreadId;
                  return (
                    <Pressable
                      key={thread.id}
                      onPress={() => selectThread(thread.id)}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      accessibilityLabel={thread.title || "Untitled chat"}
                      style={({ pressed }) => [
                        styles.session,
                        selected && { backgroundColor: theme.accent },
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
                    {mode === "dictate" ? "No dictations yet" : "No chats yet"}
                  </ThemedText>
                  <ThemedText themeColor="mutedForeground" style={styles.empty}>
                    {mode === "dictate"
                      ? "Your recent dictations will appear here."
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
              <Pressable
                onPress={() => navigate("/(app)/profile")}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Open account and settings"
                style={({ pressed }) => [
                  styles.settingsButton,
                  { backgroundColor: theme.secondary },
                  pressed && styles.pressed,
                ]}
              >
                <Settings color={theme.foreground} size={21} />
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
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: Spacing.three,
  },
  brand: { fontSize: 30, lineHeight: 36 },
  close: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: Radius.full,
  },
  sessionsLabel: { paddingTop: Spacing.three, paddingBottom: Spacing.three },
  sessionScroll: { flex: 1, minHeight: 0 },
  sessionList: { gap: Spacing.half, paddingBottom: Spacing.two },
  session: {
    minHeight: 42,
    justifyContent: "center",
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.md,
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
  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    paddingTop: Spacing.three,
  },
  newChat: {
    flex: 1,
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.two,
    borderRadius: Radius.full,
  },
  newChatText: { fontFamily: Fonts.sansSemiBold, fontSize: 15 },
  settingsButton: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: Radius.full,
  },
  pressed: { opacity: 0.62 },
});
