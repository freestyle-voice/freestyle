import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Clock3, MessageSquarePlus, Settings, X } from "lucide-react-native";
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
import { SafeAreaView } from "react-native-safe-area-context";

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
          <SafeAreaView
            style={styles.safeArea}
            edges={["top", "bottom", "left"]}
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

            <View style={styles.quickLinks}>
              <SidebarRow
                icon={Clock3}
                label="Dictation history"
                onPress={() => navigate("/(app)/history")}
              />
            </View>
            <View style={styles.sessionsLabel}>
              <ThemedText type="eyebrow" themeColor="mutedForeground">
                RECENTS
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
              <AccountButton
                user={user}
                onPress={() => navigate("/(app)/profile")}
              />
            </View>
          </SafeAreaView>
        </Animated.View>
      </View>
    </Modal>
  );
}

function AccountButton({
  user,
  onPress,
}: {
  user: ReturnType<typeof useAuth>["user"];
  onPress: () => void;
}) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Account and settings"
      style={({ pressed }) => [
        styles.accountButton,
        { backgroundColor: theme.secondary },
        pressed && styles.pressed,
      ]}
    >
      {user?.image ? (
        <Image source={{ uri: user.image }} style={styles.avatarImage} />
      ) : (
        <View style={[styles.avatar, { backgroundColor: theme.accent }]}>
          <ThemedText style={{ color: theme.accentForeground }}>
            {user ? initialsFor(user) : "?"}
          </ThemedText>
        </View>
      )}
      <View style={styles.accountCopy}>
        <ThemedText numberOfLines={1} style={styles.accountName}>
          {user?.name ?? "Account"}
        </ThemedText>
        <ThemedText
          numberOfLines={1}
          themeColor="mutedForeground"
          style={styles.accountEmail}
        >
          {user?.email ?? "Profile and settings"}
        </ThemedText>
      </View>
      <Settings color={theme.mutedForeground} size={19} />
    </Pressable>
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
  safeArea: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.two,
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
  quickLinks: { paddingTop: Spacing.two },
  sessionsLabel: { paddingTop: Spacing.five, paddingBottom: Spacing.three },
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
    gap: Spacing.two,
    paddingTop: Spacing.three,
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
  newChat: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.two,
    borderRadius: Radius.full,
  },
  newChatText: { fontFamily: Fonts.sansSemiBold, fontSize: 15 },
  accountButton: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    paddingHorizontal: Spacing.two + 2,
    borderRadius: Radius.xl,
  },
  accountCopy: { flex: 1, gap: 2 },
  accountName: { fontFamily: Fonts.sansSemiBold, fontSize: 14 },
  accountEmail: { fontSize: 12 },
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
