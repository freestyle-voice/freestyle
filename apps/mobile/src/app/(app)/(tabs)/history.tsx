import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { Clock, Trash2 } from "lucide-react-native";
import { useCallback, useMemo, useState } from "react";
import { Alert, Pressable, StyleSheet, View } from "react-native";

import { Card, TabScreenScaffold } from "@/components/settings-ui";
import { ThemedText } from "@/components/themed-text";
import { Fonts, Radius, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { type HistoryEntry, useHistory } from "@/lib/history";

/** "Today" / "Yesterday" / "Mon, Jul 21" bucket for an entry timestamp. */
function dateGroup(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const startOf = (x: Date) =>
    new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dayMs = 86_400_000;
  const diff = Math.round((startOf(now) - startOf(d)) / dayMs);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/** Wall-clock time like "2:34 pm". */
function formatClock(ts: number): string {
  return new Date(ts)
    .toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    })
    .toLowerCase();
}

/** Recording length as "3.2s". */
function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

export default function HistoryScreen() {
  const theme = useTheme();
  const { history, removeHistory, clearHistory } = useHistory();
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Group the (already newest-first) list into ordered date buckets.
  const groups = useMemo(() => {
    const out: { label: string; entries: HistoryEntry[] }[] = [];
    for (const entry of history) {
      const label = dateGroup(entry.createdAt);
      const last = out[out.length - 1];
      if (last && last.label === label) last.entries.push(entry);
      else out.push({ label, entries: [entry] });
    }
    return out;
  }, [history]);

  const copy = useCallback(async (entry: HistoryEntry) => {
    await Clipboard.setStringAsync(entry.text);
    setCopiedId(entry.id);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTimeout(() => setCopiedId(null), 1500);
  }, []);

  const confirmClear = useCallback(() => {
    Alert.alert(
      "Clear history?",
      "This permanently removes every saved dictation on this device.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Clear all", style: "destructive", onPress: clearHistory },
      ],
    );
  }, [clearHistory]);

  return (
    <TabScreenScaffold
      title="History"
      subtitle="Your recent dictations, kept on this device. Tap any entry to copy it."
      action={
        history.length > 0 ? (
          <Pressable
            onPress={confirmClear}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Clear history"
            style={[styles.clearBtn, { borderColor: theme.border }]}
          >
            <Trash2 color={theme.destructive} size={18} />
          </Pressable>
        ) : null
      }
    >
      {history.length === 0 ? (
        <Card>
          <View style={styles.empty}>
            <Clock color={theme.mutedForeground} size={22} />
            <ThemedText themeColor="mutedForeground" style={styles.emptyText}>
              No dictations yet. What you speak will show up here.
            </ThemedText>
          </View>
        </Card>
      ) : (
        groups.map((group) => (
          <View key={group.label} style={styles.group}>
            <ThemedText type="eyebrow" themeColor="mutedForeground">
              {group.label}
            </ThemedText>
            <Card style={styles.listCard}>
              {group.entries.map((entry, i) => (
                <View key={entry.id}>
                  {i > 0 ? (
                    <View
                      style={[
                        styles.divider,
                        { backgroundColor: theme.border },
                      ]}
                    />
                  ) : null}
                  <View style={styles.entryRow}>
                    <Pressable
                      style={styles.entryText}
                      onPress={() => copy(entry)}
                      accessibilityRole="button"
                      accessibilityLabel="Copy transcript"
                    >
                      <View style={styles.metaRow}>
                        <ThemedText
                          themeColor="mutedForeground"
                          style={styles.meta}
                        >
                          {formatClock(entry.createdAt)}
                        </ThemedText>
                        <ThemedText
                          themeColor="mutedForeground"
                          style={styles.meta}
                        >
                          · {formatSeconds(entry.durationMs)}
                        </ThemedText>
                        {copiedId === entry.id ? (
                          <ThemedText
                            style={[styles.meta, { color: theme.primary }]}
                          >
                            · Copied
                          </ThemedText>
                        ) : null}
                      </View>
                      <ThemedText style={styles.text} numberOfLines={4}>
                        {entry.text}
                      </ThemedText>
                    </Pressable>
                    <Pressable
                      onPress={() => removeHistory(entry.id)}
                      hitSlop={8}
                      style={styles.iconBtn}
                      accessibilityRole="button"
                      accessibilityLabel="Delete entry"
                    >
                      <Trash2 color={theme.destructive} size={17} />
                    </Pressable>
                  </View>
                </View>
              ))}
            </Card>
          </View>
        ))
      )}
    </TabScreenScaffold>
  );
}

const styles = StyleSheet.create({
  empty: {
    alignItems: "center",
    gap: Spacing.two,
    paddingVertical: Spacing.four,
  },
  emptyText: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    maxWidth: 260,
  },
  group: { gap: Spacing.two },
  listCard: { gap: 0 },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: -Spacing.three,
  },
  entryRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.two,
    paddingVertical: Spacing.three - 2,
  },
  entryText: { flex: 1, gap: 4 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  meta: {
    fontFamily: Fonts.mono,
    fontSize: 10,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  text: { fontFamily: Fonts.sans, fontSize: 15, lineHeight: 21 },
  iconBtn: { padding: 4 },
  clearBtn: {
    width: 34,
    height: 34,
    borderRadius: Radius.full,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
