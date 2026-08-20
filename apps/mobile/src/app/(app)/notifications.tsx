import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Bell, Check, X } from "lucide-react-native";
import { Alert, Pressable, StyleSheet, View } from "react-native";

import {
  Card,
  RetryLoadState,
  SettingsScreenScaffold,
} from "@/components/settings-ui";
import { ThemedText } from "@/components/themed-text";
import { Fonts, Radius, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import {
  dismissNotification,
  listNotifications,
  openNotification,
} from "@/lib/cloud/notifications";

export default function NotificationsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const {
    data: notifications = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["agent-notifications"],
    queryFn: listNotifications,
    retry: 1,
  });
  const invalidate = () =>
    void queryClient.invalidateQueries({ queryKey: ["agent-notifications"] });
  const open = useMutation({
    mutationFn: openNotification,
    onSuccess: invalidate,
  });
  const dismiss = useMutation({
    mutationFn: dismissNotification,
    onSuccess: invalidate,
  });
  const fail = (error: unknown) =>
    Alert.alert(
      "Couldn't update notification",
      error instanceof Error ? error.message : "Try again.",
    );

  return (
    <SettingsScreenScaffold
      title="Notifications"
      subtitle="Updates from scheduled Remix work. Open one to see the full result."
    >
      {isLoading ? (
        <Card>
          <ThemedText themeColor="mutedForeground">
            Loading notifications…
          </ThemedText>
        </Card>
      ) : isError && notifications.length === 0 ? (
        <Card>
          <RetryLoadState
            message="Couldn't load notifications. Check your connection and try again."
            onRetry={() => void refetch()}
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
        notifications.map((notification) => (
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
                onPress={() =>
                  dismiss.mutate(notification.id, { onError: fail })
                }
                accessibilityRole="button"
                accessibilityLabel="Dismiss notification"
                style={[styles.dismiss, { borderColor: theme.border }]}
              >
                <X size={15} color={theme.mutedForeground} />
              </Pressable>
            </View>
            {notification.payload?.threadId ? (
              <Pressable
                onPress={() =>
                  open.mutate(notification.id, {
                    onSuccess: () =>
                      router.push({
                        pathname: "/(app)/agent-thread/[id]",
                        params: { id: notification.payload?.threadId ?? "" },
                      }),
                    onError: fail,
                  })
                }
                style={[styles.open, { backgroundColor: theme.primary }]}
                accessibilityRole="button"
              >
                <Check size={15} color={theme.primaryForeground} />
                <ThemedText
                  style={[styles.openText, { color: theme.primaryForeground }]}
                >
                  Open result
                </ThemedText>
              </Pressable>
            ) : null}
          </Card>
        ))
      )}
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
