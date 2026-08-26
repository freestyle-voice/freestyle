import { useRouter } from "expo-router";
import { Bell, Check, Clock, X } from "lucide-react-native";
import { Alert, Pressable, StyleSheet, View } from "react-native";

import {
  Card,
  RetryLoadState,
  SectionTitle,
  SettingsScreenScaffold,
} from "@/components/settings-ui";
import { ThemedText } from "@/components/themed-text";
import { Fonts, Radius, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { useCourierNotifications } from "@/lib/courier/notifications";

export default function NotificationsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { active, archived, archive, error, loading, open, refresh } =
    useCourierNotifications();
  const notifications = active.filter((notification) => !notification.opened);
  const previous = [
    ...active.filter((notification) => notification.opened),
    ...archived,
  ];
  const fail = (cause: unknown) =>
    Alert.alert(
      "Couldn't update notification",
      cause instanceof Error ? cause.message : "Try again.",
    );

  const openResult = async (notificationId: string, threadId: string) => {
    try {
      await open(notificationId);
      router.push({
        pathname: "/(app)/agent-thread/[id]",
        params: { id: threadId },
      });
    } catch (cause) {
      fail(cause);
    }
  };

  return (
    <SettingsScreenScaffold
      title="Notifications"
      subtitle="Updates from scheduled Remix work. Open one to see the full result."
    >
      {loading ? (
        <Card>
          <ThemedText themeColor="mutedForeground">
            Loading notifications…
          </ThemedText>
        </Card>
      ) : error && notifications.length === 0 ? (
        <Card>
          <RetryLoadState
            message="Couldn't load notifications. Check your connection and try again."
            onRetry={() => void refresh()}
          />
        </Card>
      ) : notifications.length === 0 ? (
        <Card>
          <View style={styles.empty}>
            <Bell color={theme.mutedForeground} size={22} />
            <ThemedText themeColor="mutedForeground" style={styles.emptyText}>
              You're all caught up. Remix only notifies you when an automation
              finds something worth seeing.
            </ThemedText>
          </View>
        </Card>
      ) : (
        notifications.map((notification) => {
          const threadId =
            typeof notification.data?.threadId === "string"
              ? notification.data.threadId
              : undefined;
          return (
            <Card key={notification.id}>
              <View style={styles.top}>
                <View style={styles.copy}>
                  <ThemedText style={styles.title}>
                    {notification.title}
                  </ThemedText>
                  <ThemedText themeColor="mutedForeground" style={styles.body}>
                    {notification.body}
                  </ThemedText>
                </View>
                <Pressable
                  onPress={() => void archive(notification.id).catch(fail)}
                  accessibilityRole="button"
                  accessibilityLabel="Dismiss notification"
                  style={[styles.dismiss, { borderColor: theme.border }]}
                >
                  <X size={15} color={theme.mutedForeground} />
                </Pressable>
              </View>
              {threadId ? (
                <Pressable
                  onPress={() => void openResult(notification.id, threadId)}
                  style={[styles.open, { backgroundColor: theme.primary }]}
                  accessibilityRole="button"
                >
                  <Check size={15} color={theme.primaryForeground} />
                  <ThemedText
                    style={[
                      styles.openText,
                      { color: theme.primaryForeground },
                    ]}
                  >
                    Open result
                  </ThemedText>
                </Pressable>
              ) : null}
            </Card>
          );
        })
      )}

      {previous.length > 0 ? (
        <Card>
          <SectionTitle icon={Clock} title="Earlier" />
          <ThemedText themeColor="mutedForeground" style={styles.historyHint}>
            Previously opened, dismissed, or expired updates. Open a brief to
            revisit its conversation.
          </ThemedText>
          {previous.map((notification, index) => {
            const threadId =
              typeof notification.data?.threadId === "string"
                ? notification.data.threadId
                : undefined;
            return (
              <Pressable
                key={notification.id}
                onPress={
                  threadId
                    ? () =>
                        router.push({
                          pathname: "/(app)/agent-thread/[id]",
                          params: { id: threadId },
                        })
                    : undefined
                }
                disabled={!threadId}
                accessibilityRole={threadId ? "button" : undefined}
                accessibilityLabel={
                  threadId
                    ? `Open previous notification: ${notification.title}`
                    : undefined
                }
                style={({ pressed }) => [
                  styles.historyRow,
                  index > 0 && {
                    borderTopWidth: StyleSheet.hairlineWidth,
                    borderColor: theme.border,
                  },
                  threadId && pressed && { opacity: 0.6 },
                ]}
              >
                <View style={styles.copy}>
                  <ThemedText style={styles.title} numberOfLines={1}>
                    {notification.title}
                  </ThemedText>
                  <ThemedText
                    themeColor="mutedForeground"
                    style={styles.body}
                    numberOfLines={2}
                  >
                    {notification.body}
                  </ThemedText>
                </View>
                <ThemedText themeColor="mutedForeground" style={styles.state}>
                  {notification.opened ? "Opened" : "Cleared"}
                </ThemedText>
              </Pressable>
            );
          })}
        </Card>
      ) : null}
    </SettingsScreenScaffold>
  );
}

const styles = StyleSheet.create({
  empty: {
    alignItems: "center",
    gap: Spacing.two,
    paddingVertical: Spacing.two,
  },
  emptyText: { textAlign: "center", fontSize: 14, lineHeight: 21 },
  top: { flexDirection: "row", gap: Spacing.two },
  copy: { flex: 1, gap: Spacing.one },
  title: { fontFamily: Fonts.sansMedium, fontSize: 16 },
  body: { fontSize: 14, lineHeight: 20 },
  historyHint: { fontSize: 13, lineHeight: 19 },
  historyRow: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    paddingVertical: Spacing.two,
  },
  state: { fontFamily: Fonts.mono, fontSize: 10 },
  dismiss: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: Radius.full,
  },
  open: {
    alignSelf: "flex-start",
    minHeight: 36,
    paddingHorizontal: Spacing.three,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.one,
    borderRadius: Radius.full,
  },
  openText: { fontFamily: Fonts.sansSemiBold, fontSize: 13 },
});
