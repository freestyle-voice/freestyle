import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import {
  CirclePlay,
  Pause,
  Pencil,
  Play,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react-native";
import { useState } from "react";
import {
  Alert,
  Pressable,
  StyleSheet,
  Switch,
  TextInput,
  View,
} from "react-native";

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
  createScheduledTask,
  deleteScheduledTask,
  listScheduledTasks,
  runScheduledTask,
  type ScheduledTask,
  type ScheduledTaskInput,
  setScheduledTaskEnabled,
  updateScheduledTask,
} from "@/lib/cloud/scheduled";

type AutomationEditor =
  | { id: null; draft: ScheduledTaskInput }
  | { id: string; draft: ScheduledTaskInput };

function newAutomationDraft(): ScheduledTaskInput {
  return {
    name: "",
    instruction: "",
    schedule: "",
    cron: null,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  };
}

function draftFromTask(task: ScheduledTask): ScheduledTaskInput {
  return {
    name: task.name,
    instruction: task.instruction,
    schedule: task.schedule,
    cron: task.cron,
    timezone: task.timezone,
  };
}

export default function AutomationsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [editor, setEditor] = useState<AutomationEditor | null>(null);
  const [lastRun, setLastRun] = useState<{
    taskId: string;
    threadId: string | null;
  } | null>(null);
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
  const save = useMutation({
    mutationFn: (next: AutomationEditor) =>
      next.id
        ? updateScheduledTask(next.id, next.draft)
        : createScheduledTask(next.draft),
    onSuccess: () => {
      setEditor(null);
      invalidate();
    },
  });
  const run = useMutation({
    mutationFn: (taskId: string) => runScheduledTask(taskId),
    onSuccess: (result, taskId) => {
      invalidate();
      setLastRun({ taskId, threadId: result.threadId });
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
        <SectionTitle icon={Sparkles} title="Create an automation" />
        <ThemedText themeColor="mutedForeground" style={styles.description}>
          Set up a recurring brief, follow-up, or research task here, or ask
          Remix to create one in a conversation.
        </ThemedText>
        <View style={styles.createActions}>
          <Pressable
            onPress={() => setEditor({ id: null, draft: newAutomationDraft() })}
            style={[styles.create, { backgroundColor: theme.primary }]}
            accessibilityRole="button"
          >
            <Plus size={16} color={theme.primaryForeground} />
            <ThemedText
              style={[styles.createText, { color: theme.primaryForeground }]}
            >
              New automation
            </ThemedText>
          </Pressable>
          <Pressable
            onPress={() => router.push("/(app)/(tabs)")}
            style={[styles.secondaryAction, { borderColor: theme.border }]}
            accessibilityRole="button"
          >
            <Sparkles size={15} color={theme.primary} />
            <ThemedText style={[styles.createText, { color: theme.primary }]}>
              Ask Remix
            </ThemedText>
          </Pressable>
        </View>
      </Card>

      {editor ? (
        <AutomationForm
          editor={editor}
          busy={save.isPending}
          onChange={setEditor}
          onCancel={() => setEditor(null)}
          onSave={() =>
            save.mutate(editor, {
              onError: (error) =>
                reportError("Couldn't save automation", error),
            })
          }
        />
      ) : null}

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
                    setEditor({ id: task.id, draft: draftFromTask(task) })
                  }
                  disabled={save.isPending || run.isPending}
                  style={[styles.action, { borderColor: theme.border }]}
                  accessibilityRole="button"
                >
                  <Pencil size={14} color={theme.primary} />
                  <ThemedText
                    style={[styles.actionText, { color: theme.primary }]}
                  >
                    Edit
                  </ThemedText>
                </Pressable>
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
                {lastRun?.taskId === task.id && lastRun.threadId ? (
                  <Pressable
                    onPress={() =>
                      router.push({
                        pathname: "/(app)/agent-thread/[id]",
                        params: { id: lastRun.threadId ?? "" },
                      })
                    }
                    style={[styles.action, { borderColor: theme.border }]}
                    accessibilityRole="button"
                  >
                    <ThemedText
                      style={[styles.actionText, { color: theme.primary }]}
                    >
                      View brief
                    </ThemedText>
                  </Pressable>
                ) : null}
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

function AutomationForm({
  editor,
  busy,
  onChange,
  onCancel,
  onSave,
}: {
  editor: AutomationEditor;
  busy: boolean;
  onChange: (editor: AutomationEditor) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const theme = useTheme();
  const valid =
    editor.draft.name.trim().length > 0 &&
    editor.draft.instruction.trim().length > 0 &&
    editor.draft.schedule.trim().length > 0 &&
    editor.draft.timezone.trim().length > 0;
  const set = <K extends keyof ScheduledTaskInput>(
    key: K,
    value: ScheduledTaskInput[K],
  ) => onChange({ ...editor, draft: { ...editor.draft, [key]: value } });

  return (
    <Card>
      <SectionTitle
        icon={Sparkles}
        title={editor.id ? "Edit automation" : "New automation"}
      />
      <ThemedText themeColor="mutedForeground" style={styles.description}>
        Freestyle will run this even when the app is closed. It only notifies
        you when there is something useful to share.
      </ThemedText>
      <AutomationField
        label="Name"
        value={editor.draft.name}
        placeholder="Morning brief"
        onChangeText={(value) => set("name", value)}
      />
      <AutomationField
        label="Schedule, in your words"
        value={editor.draft.schedule}
        placeholder="Every weekday at 8am"
        onChangeText={(value) => set("schedule", value)}
      />
      <AutomationField
        label="Cron (optional)"
        value={editor.draft.cron ?? ""}
        placeholder="0 8 * * 1-5"
        onChangeText={(value) => set("cron", value.trim() || null)}
        autoCapitalize="none"
      />
      <AutomationField
        label="Timezone"
        value={editor.draft.timezone}
        placeholder="Asia/Kolkata"
        onChangeText={(value) => set("timezone", value)}
        autoCapitalize="none"
      />
      <AutomationField
        label="What Freestyle does"
        value={editor.draft.instruction}
        placeholder="Check my calendar and priority email, then send a concise brief."
        onChangeText={(value) => set("instruction", value)}
        multiline
      />
      <View style={styles.formActions}>
        <Pressable
          onPress={onCancel}
          disabled={busy}
          style={[styles.secondaryAction, { borderColor: theme.border }]}
          accessibilityRole="button"
        >
          <ThemedText>Cancel</ThemedText>
        </Pressable>
        <Pressable
          onPress={onSave}
          disabled={!valid || busy}
          style={[
            styles.create,
            { backgroundColor: theme.primary },
            (!valid || busy) && styles.disabled,
          ]}
          accessibilityRole="button"
        >
          <ThemedText
            style={[styles.createText, { color: theme.primaryForeground }]}
          >
            {busy ? "Saving…" : "Save automation"}
          </ThemedText>
        </Pressable>
      </View>
    </Card>
  );
}

function AutomationField({
  label,
  value,
  placeholder,
  onChangeText,
  multiline = false,
  autoCapitalize = "sentences",
}: {
  label: string;
  value: string;
  placeholder: string;
  onChangeText: (value: string) => void;
  multiline?: boolean;
  autoCapitalize?: "none" | "sentences";
}) {
  const theme = useTheme();
  return (
    <View style={styles.field}>
      <ThemedText style={styles.fieldLabel}>{label}</ThemedText>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.mutedForeground}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        multiline={multiline}
        textAlignVertical={multiline ? "top" : "center"}
        style={[
          styles.input,
          multiline && styles.multilineInput,
          { borderColor: theme.border, color: theme.foreground },
        ]}
      />
    </View>
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
  createActions: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.two },
  secondaryAction: {
    minHeight: 40,
    paddingHorizontal: Spacing.three,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.one,
    borderWidth: 1,
    borderRadius: Radius.full,
  },
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
  field: { gap: Spacing.one },
  fieldLabel: { fontFamily: Fonts.sansMedium, fontSize: 13 },
  input: {
    minHeight: 42,
    paddingHorizontal: Spacing.two,
    borderWidth: 1,
    borderRadius: Radius.md,
    fontFamily: Fonts.sans,
    fontSize: 14,
  },
  multilineInput: { minHeight: 90, paddingVertical: Spacing.two },
  formActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    flexWrap: "wrap",
    gap: Spacing.two,
  },
});
