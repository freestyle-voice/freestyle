import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { CirclePlay, Pause, Play, Sparkles, Trash2 } from "lucide-react-native";
import { Alert, Pressable, StyleSheet, Switch, View } from "react-native";

import {
  Card,
  RetryLoadState,
  SectionTitle,
  SettingsScreenScaffold,
} from "@/components/settings-ui";
import { ThemedText } from "@/components/themed-text";
import { Fonts, Radius, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import {
  deleteScheduledTask,
  listScheduledTasks,
  runScheduledTask,
  setScheduledTaskEnabled,
} from "@/lib/cloud/scheduled";

export default function AutomationsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const {
    data: tasks = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["scheduled-tasks"],
    queryFn: listScheduledTasks,
    retry: 1,
  });
  const invalidate = () =>
    void queryClient.invalidateQueries({ queryKey: ["scheduled-tasks"] });
  const update = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      setScheduledTaskEnabled(id, enabled),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: deleteScheduledTask,
    onSuccess: invalidate,
  });
  const run = useMutation({
    mutationFn: runScheduledTask,
    onSuccess: (result) => {
      invalidate();
      if (result.threadId)
        router.push({
          pathname: "/(app)/agent-thread/[id]",
          params: { id: result.threadId },
        });
    },
  });

  const reportError = (title: string, error: unknown) =>
    Alert.alert(title, error instanceof Error ? error.message : "Try again.");

  return (
    <SettingsScreenScaffold
      title="Automations"
      subtitle="Remix can do recurring work even when the app is closed. It only notifies you when it finds something useful."
    >
      <Card>
        <SectionTitle icon={Sparkles} title="Create with Remix" />
        <ThemedText themeColor="mutedForeground" style={styles.description}>
          Ask Remix to create a recurring brief, follow-up, or research task. It
          will confirm the schedule in the conversation.
        </ThemedText>
        <Pressable
          onPress={() => router.push("/(app)/(tabs)")}
          style={[styles.create, { backgroundColor: theme.primary }]}
          accessibilityRole="button"
        >
          <Sparkles size={16} color={theme.primaryForeground} />
          <ThemedText
            style={[styles.createText, { color: theme.primaryForeground }]}
          >
            Ask Remix
          </ThemedText>
        </Pressable>
      </Card>

      <Card>
        <SectionTitle icon={CirclePlay} title="Your automations" />
        {isLoading ? (
          <ThemedText themeColor="mutedForeground" style={styles.description}>
            Loading automations…
          </ThemedText>
        ) : isError && tasks.length === 0 ? (
          <RetryLoadState
            message="Couldn't load automations. Check your connection and try again."
            onRetry={() => void refetch()}
          />
        ) : tasks.length === 0 ? (
          <ThemedText themeColor="mutedForeground" style={styles.description}>
            No automations yet. Try “send me a morning brief of my calendar and
            priority email.”
          </ThemedText>
        ) : (
          tasks.map((task, index) => (
            <View
              key={task.id}
              style={[
                styles.task,
                index > 0 && {
                  borderTopWidth: StyleSheet.hairlineWidth,
                  borderColor: theme.border,
                },
              ]}
            >
              <View style={styles.taskTop}>
                <View style={styles.taskCopy}>
                  <ThemedText style={styles.taskName}>{task.name}</ThemedText>
                  <ThemedText themeColor="mutedForeground" style={styles.meta}>
                    {task.schedule} · {task.timezone}
                  </ThemedText>
                </View>
                <Switch
                  value={task.enabled}
                  onValueChange={(enabled) =>
                    update.mutate(
                      { id: task.id, enabled },
                      {
                        onError: (error) =>
                          reportError("Couldn't update automation", error),
                      },
                    )
                  }
                  disabled={update.isPending}
                  trackColor={{ true: theme.primary, false: theme.secondary }}
                />
              </View>
              <ThemedText
                themeColor="mutedForeground"
                style={styles.instruction}
                numberOfLines={2}
              >
                {task.instruction}
              </ThemedText>
              <View style={styles.actions}>
                <Pressable
                  onPress={() =>
                    run.mutate(task.id, {
                      onError: (error) =>
                        reportError("Couldn't run automation", error),
                    })
                  }
                  disabled={!task.enabled || run.isPending}
                  style={[
                    styles.action,
                    { borderColor: theme.border },
                    (!task.enabled || run.isPending) && styles.disabled,
                  ]}
                  accessibilityRole="button"
                >
                  {task.enabled ? (
                    <Play size={14} color={theme.primary} />
                  ) : (
                    <Pause size={14} color={theme.mutedForeground} />
                  )}
                  <ThemedText
                    style={[
                      styles.actionText,
                      {
                        color: task.enabled
                          ? theme.primary
                          : theme.mutedForeground,
                      },
                    ]}
                  >
                    Run now
                  </ThemedText>
                </Pressable>
                <Pressable
                  onPress={() =>
                    Alert.alert(
                      "Delete automation?",
                      "Its history will also be removed.",
                      [
                        { text: "Cancel", style: "cancel" },
                        {
                          text: "Delete",
                          style: "destructive",
                          onPress: () =>
                            remove.mutate(task.id, {
                              onError: (error) =>
                                reportError(
                                  "Couldn't delete automation",
                                  error,
                                ),
                            }),
                        },
                      ],
                    )
                  }
                  disabled={remove.isPending}
                  style={[styles.action, { borderColor: theme.border }]}
                  accessibilityRole="button"
                >
                  <Trash2 size={14} color={theme.destructive} />
                  <ThemedText
                    style={[styles.actionText, { color: theme.destructive }]}
                  >
                    Delete
                  </ThemedText>
                </Pressable>
              </View>
            </View>
          ))
        )}
      </Card>
    </SettingsScreenScaffold>
  );
}

const styles = StyleSheet.create({
  description: { fontSize: 14, lineHeight: 21 },
  create: {
    alignSelf: "flex-start",
    minHeight: 40,
    paddingHorizontal: Spacing.three,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    borderRadius: Radius.full,
  },
  createText: { fontFamily: Fonts.sansSemiBold, fontSize: 14 },
  task: { gap: Spacing.two, paddingVertical: Spacing.two },
  taskTop: { flexDirection: "row", alignItems: "center", gap: Spacing.two },
  taskCopy: { flex: 1, gap: 3 },
  taskName: { fontFamily: Fonts.sansMedium, fontSize: 15 },
  meta: { fontFamily: Fonts.mono, fontSize: 11, lineHeight: 16 },
  instruction: { fontSize: 13, lineHeight: 19 },
  actions: { flexDirection: "row", gap: Spacing.two },
  action: {
    minHeight: 34,
    paddingHorizontal: Spacing.two,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.one,
    borderWidth: 1,
    borderRadius: Radius.full,
  },
  actionText: { fontFamily: Fonts.sansMedium, fontSize: 12 },
  disabled: { opacity: 0.5 },
});
