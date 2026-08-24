import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import {
  ChevronRight,
  Clock3,
  MessageSquarePlus,
  Settings,
  X,
} from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { Fonts, Radius, Spacing } from "@/constants/theme";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/hooks/use-theme";
import { initialsFor } from "@/lib/initials";
import { listThreads } from "@/lib/remix/client";
import { remixQueryKeys } from "@/lib/remix/query";

const MAX_RECENT_SESSIONS = 24;

type ChatSidebarProps = {
  visible: boolean;
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
  currentThreadId,
  onClose,
  onNewChat,
}: ChatSidebarProps) {
  const theme = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
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

  const navigate = (
    path: "/(app)/history" | "/(app)/settings" | "/(app)/profile",
  ) => {
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
          <SafeAreaView
            // Draw edge-to-edge like a true sidebar. We retain only the minimum
            // clearance for the status bar and home indicator instead of the
            // full safe-area padding that made the panel feel vertically inset.
            style={[
              styles.safeArea,
              {
                paddingTop: Math.max(insets.top - Spacing.four, 0),
                paddingBottom: Math.max(insets.bottom - Spacing.four, 0),
              },
            ]}
            edges={["left"]}
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
              <MessageSquarePlus color={theme.primaryForeground} size={19} />
              <ThemedText
                style={[styles.newChatText, { color: theme.primaryForeground }]}
              >
                New chat
              </ThemedText>
            </Pressable>

            <View style={styles.sessionsLabel}>
              <ThemedText type="eyebrow" themeColor="mutedForeground">
                RECENT CHATS
              </ThemedText>
            </View>
            <ScrollView
              style={styles.sessionScroll}
              contentContainerStyle={styles.sessionList}
              showsVerticalScrollIndicator={false}
            >
              {isLoading ? (
                <ThemedText themeColor="mutedForeground" style={styles.empty}>
                  Loading conversations…
                </ThemedText>
              ) : data?.threads.length ? (
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
                    No chats yet
                  </ThemedText>
                  <ThemedText themeColor="mutedForeground" style={styles.empty}>
                    Start a chat and it will stay here for next time.
                  </ThemedText>
                </View>
              )}
            </ScrollView>

            <View style={[styles.footer, { borderTopColor: theme.border }]}>
              <SidebarRow
                icon={Clock3}
                label="Dictation history"
                onPress={() => navigate("/(app)/history")}
              />
              <SidebarRow
                icon={Settings}
                label="Settings"
                onPress={() => navigate("/(app)/settings")}
              />
              <Pressable
                onPress={() => navigate("/(app)/profile")}
                accessibilityRole="button"
                accessibilityLabel="Profile"
                style={({ pressed }) => [
                  styles.profileRow,
                  pressed && styles.pressed,
                ]}
              >
                {user?.image ? (
                  <Image
                    source={{ uri: user.image }}
                    style={styles.avatarImage}
                  />
                ) : (
                  <View
                    style={[styles.avatar, { backgroundColor: theme.accent }]}
                  >
                    <ThemedText style={{ color: theme.accentForeground }}>
                      {user ? initialsFor(user) : "?"}
                    </ThemedText>
                  </View>
                )}
                <View style={styles.profileCopy}>
                  <ThemedText numberOfLines={1} style={styles.profileName}>
                    {user?.name || "Profile"}
                  </ThemedText>
                  {user?.email ? (
                    <ThemedText
                      numberOfLines={1}
                      themeColor="mutedForeground"
                      style={styles.profileEmail}
                    >
                      {user.email}
                    </ThemedText>
                  ) : null}
                </View>
                <ChevronRight color={theme.mutedForeground} size={18} />
              </Pressable>
            </View>
          </SafeAreaView>
        </Animated.View>
      </View>
    </Modal>
  );
}

function SidebarRow({
  icon: Icon,
  label,
  onPress,
}: {
  icon: typeof Settings;
  label: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.footerRow, pressed && styles.pressed]}
    >
      <Icon color={theme.mutedForeground} size={19} />
      <ThemedText style={styles.footerLabel}>{label}</ThemedText>
    </Pressable>
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
  safeArea: { flex: 1, paddingHorizontal: Spacing.three },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: Spacing.one,
    paddingBottom: Spacing.two,
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
  newChat: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.two,
    borderRadius: Radius.lg,
    marginTop: Spacing.two,
  },
  newChatText: { fontFamily: Fonts.sansSemiBold, fontSize: 15 },
  sessionsLabel: { paddingTop: Spacing.four, paddingBottom: Spacing.two },
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
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing.two,
    gap: Spacing.half,
  },
  footerRow: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.md,
  },
  footerLabel: { fontFamily: Fonts.sansMedium, fontSize: 14 },
  profileRow: {
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    paddingHorizontal: Spacing.two,
    marginTop: Spacing.half,
    marginBottom: Spacing.one,
    borderRadius: Radius.md,
  },
  profileCopy: { flex: 1, minWidth: 0 },
  profileName: { fontFamily: Fonts.sansSemiBold, fontSize: 14 },
  profileEmail: { fontSize: 12, marginTop: 1 },
  avatar: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: Radius.full,
  },
  avatarImage: { width: 30, height: 30, borderRadius: Radius.full },
  pressed: { opacity: 0.62 },
});
