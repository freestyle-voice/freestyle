import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { useFocusEffect } from "expo-router";
import { Clock, Search, SearchX, Trash2, X } from "lucide-react-native";
import { useCallback, useMemo, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";

import { Card, TabScreenScaffold } from "@/components/settings-ui";
import { ThemedText } from "@/components/themed-text";
import { Fonts, Radius, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import {
  deriveHistoryStats,
  type HistoryEntry,
  useHistory,
} from "@/lib/history";
import { confirmClearHistory } from "@/lib/history-alerts";

interface DateGroup {
  key: string;
  label: string;
}

/** Stable key + "Today" / "Yesterday" / localized date label. */
function dateGroup(ts: number, nowTs: number): DateGroup {
  const d = new Date(ts);
  const now = new Date(nowTs);
  const startOf = (x: Date) =>
    new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dayMs = 86_400_000;
  const diff = Math.round((startOf(now) - startOf(d)) / dayMs);
  const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  if (diff === 0) return { key, label: "Today" };
  if (diff === 1) return { key, label: "Yesterday" };
  return {
    key,
    label: d.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      ...(d.getFullYear() !== now.getFullYear()
        ? { year: "numeric" as const }
        : {}),
    }),
  };
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

/** Compact duration: "12s", "3.4m", "1.2h". */
function formatDuration(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${(ms / 60_000).toFixed(1)}m`;
  return `${(ms / 3_600_000).toFixed(1)}h`;
}

/** Compact integer: 1250 → "1.3k". */
function formatCount(n: number): string {
  if (n < 1000) return String(n);
  return `${(n / 1000).toFixed(1)}k`;
}

export default function HistoryScreen() {
  const theme = useTheme();
  const { history, pauseHistory, removeHistory, clearHistory } = useHistory();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [now, setNow] = useState(Date.now);

  useFocusEffect(
    useCallback(() => {
      setNow(Date.now());
    }, []),
  );

  const stats = useMemo(() => deriveHistoryStats(history, now), [history, now]);
  const maxDayWords = Math.max(1, ...stats.last7Days);

  // Case-insensitive substring match on the transcript text. The full list is
  // already in memory (max 500), so filtering client-side is instant.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return history;
    return history.filter((e) => e.text.toLowerCase().includes(q));
  }, [history, search]);

  // Group the (already newest-first) list into ordered date buckets.
  const groups = useMemo(() => {
    const out: { key: string; label: string; entries: HistoryEntry[] }[] = [];
    for (const entry of filtered) {
      const group = dateGroup(entry.createdAt, now);
      const last = out[out.length - 1];
      if (last && last.key === group.key) last.entries.push(entry);
      else out.push({ ...group, entries: [entry] });
    }
    return out;
  }, [filtered, now]);

  const copy = useCallback(async (entry: HistoryEntry) => {
    await Clipboard.setStringAsync(entry.text);
    setCopiedId(entry.id);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTimeout(() => setCopiedId(null), 1500);
  }, []);

  return (
    <TabScreenScaffold
      title="History"
      subtitle="Your recent dictations, kept on this device. Tap any entry to copy it."
      action={
        history.length > 0 ? (
          <Pressable
            onPress={() => confirmClearHistory(clearHistory)}
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
      {history.length > 0 ? (
        <Card>
          <View style={styles.statsRow}>
            <StatCell
              label="Dictations"
              value={formatCount(stats.totalSessions)}
            />
            <StatCell label="Words" value={formatCount(stats.totalWords)} />
            <StatCell
              label="Spoken"
              value={formatDuration(stats.totalDurationMs)}
            />
            <StatCell
              label="Last 7 days"
              value={formatCount(stats.last7Words)}
              hint={`${stats.last7Sessions} dictations`}
            />
          </View>
          <View style={styles.activityRow}>
            {stats.last7Days.map((words, i) => {
              const height = Math.max(
                3,
                Math.round((words / maxDayWords) * 28),
              );
              return (
                <View key={i} style={styles.activityBarWrap}>
                  <View
                    style={[
                      styles.activityBar,
                      {
                        height,
                        backgroundColor:
                          words > 0 ? theme.primary : theme.border,
                      },
                    ]}
                  />
                </View>
              );
            })}
          </View>
          <ThemedText themeColor="mutedForeground" style={styles.activityHint}>
            Last 7 days · words spoken
          </ThemedText>
        </Card>
      ) : null}

      {pauseHistory ? (
        <Card>
          <ThemedText themeColor="mutedForeground" style={styles.pauseNotice}>
            History is paused. New dictations won't be saved until you turn
            saving back on in Settings.
          </ThemedText>
        </Card>
      ) : null}

      {history.length > 0 ? (
        <View style={[styles.searchBar, { borderColor: theme.border }]}>
          <Search color={theme.mutedForeground} size={16} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search dictations"
            placeholderTextColor={theme.mutedForeground}
            style={[styles.searchInput, { color: theme.foreground }]}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            clearButtonMode="never"
          />
          {search.length > 0 ? (
            <Pressable
              onPress={() => setSearch("")}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
            >
              <X color={theme.mutedForeground} size={16} />
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {history.length === 0 ? (
        <Card>
          <View style={styles.empty}>
            <Clock color={theme.mutedForeground} size={22} />
            <ThemedText themeColor="mutedForeground" style={styles.emptyText}>
              {pauseHistory
                ? "History is paused and empty. Turn saving back on in Settings to start collecting dictations."
                : "No dictations yet. What you speak will show up here."}
            </ThemedText>
          </View>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <View style={styles.empty}>
            <SearchX color={theme.mutedForeground} size={22} />
            <ThemedText themeColor="mutedForeground" style={styles.emptyText}>
              No dictations match "{search.trim()}".
            </ThemedText>
          </View>
        </Card>
      ) : (
        groups.map((group) => (
          <View key={group.key} style={styles.group}>
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

function StatCell({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <View style={styles.statCell}>
      <ThemedText style={styles.statValue}>{value}</ThemedText>
      <ThemedText themeColor="mutedForeground" style={styles.statLabel}>
        {label}
      </ThemedText>
      {hint ? (
        <ThemedText themeColor="mutedForeground" style={styles.statHint}>
          {hint}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: Spacing.two,
  },
  statCell: { flex: 1, gap: 2 },
  statValue: {
    fontFamily: Fonts.sansMedium,
    fontSize: 18,
    letterSpacing: -0.3,
  },
  statLabel: {
    fontFamily: Fonts.mono,
    fontSize: 10,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  statHint: { fontSize: 11, marginTop: 1 },
  activityRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 4,
    height: 32,
    marginTop: Spacing.one,
  },
  activityBarWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
  },
  activityBar: {
    width: "70%",
    borderRadius: Radius.full,
    minHeight: 3,
  },
  activityHint: {
    fontSize: 11,
    marginTop: -Spacing.one,
  },
  pauseNotice: {
    fontSize: 13,
    lineHeight: 18,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    height: 42,
    paddingHorizontal: Spacing.three,
    borderWidth: 1,
    borderRadius: Radius.lg,
  },
  searchInput: {
    flex: 1,
    fontFamily: Fonts.sans,
    fontSize: 15,
    padding: 0,
  },
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
