import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Icon } from "@/components/icon";
import { ThemedText } from "@/components/themed-text";
import { Fonts, Radius, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import {
  deleteHistoryEntry,
  getHistory,
  getHistoryStats,
  type HistoryEntry,
  type HistoryStats,
} from "@/lib/db";

export default function HistoryScreen() {
  const theme = useTheme();
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [stats, setStats] = useState<HistoryStats | null>(null);
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    const [historyData, statsData] = await Promise.all([
      getHistory({ search: search || undefined }),
      getHistoryStats(),
    ]);
    setEntries(historyData);
    setStats(statsData);
  }, [search]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData]),
  );

  useEffect(() => {
    loadData();
  }, [search, loadData]);

  const handleDelete = async (id: string) => {
    await deleteHistoryEntry(id);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    loadData();
  };

  const handleCopy = async (text: string) => {
    await Clipboard.setStringAsync(text);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const formatTimeAgo = (dateStr: string) => {
    const now = new Date();
    const date = new Date(dateStr + "Z");
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffHr = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHr / 24);

    if (diffMin < 1) return "Just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHr < 24) return `${diffHr}h ago`;
    if (diffDay < 7) return `${diffDay}d ago`;
    return date.toLocaleDateString();
  };

  const renderEntry = ({ item }: { item: HistoryEntry }) => {
    const displayText = item.cleaned_text || item.raw_text;
    const isExpanded = expandedId === item.id;

    return (
      <Pressable
        style={[
          styles.entryCard,
          {
            backgroundColor: theme.cardBackground,
            borderColor: theme.border,
          },
        ]}
        onPress={() => setExpandedId(isExpanded ? null : item.id)}
      >
        <View style={styles.entryHeader}>
          <ThemedText
            style={[
              styles.entryTime,
              { color: theme.mutedForeground, fontFamily: Fonts?.mono },
            ]}
          >
            {formatTimeAgo(item.created_at)}
          </ThemedText>
          <View style={styles.entryMeta}>
            <ThemedText
              style={[
                styles.modelBadge,
                {
                  color: theme.accentForeground,
                  backgroundColor: theme.accent,
                  fontFamily: Fonts?.mono,
                },
              ]}
            >
              {item.voice_model.split("/").pop()?.toUpperCase()}
            </ThemedText>
          </View>
        </View>

        <ThemedText
          numberOfLines={isExpanded ? undefined : 3}
          style={styles.entryText}
        >
          {displayText}
        </ThemedText>

        {isExpanded && (
          <View style={styles.entryActions}>
            <Pressable
              style={[styles.entryAction, { backgroundColor: theme.primary }]}
              onPress={() => handleCopy(displayText)}
            >
              <ThemedText style={styles.entryActionText}>Copy</ThemedText>
            </Pressable>
            <Pressable
              style={[
                styles.entryAction,
                {
                  borderColor: `${theme.danger}60`,
                  borderWidth: 1,
                  backgroundColor: "transparent",
                },
              ]}
              onPress={() => handleDelete(item.id)}
            >
              <ThemedText
                style={[styles.entryActionText, { color: theme.danger }]}
              >
                Delete
              </ThemedText>
            </Pressable>
          </View>
        )}
      </Pressable>
    );
  };

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.background }]}
    >
      <View style={styles.header}>
        <ThemedText
          style={[
            styles.title,
            { fontFamily: Fonts?.serif, color: theme.primary },
          ]}
        >
          History.
        </ThemedText>
      </View>

      {stats && stats.total_sessions > 0 && (
        <View style={styles.statsRow}>
          <View
            style={[
              styles.statCard,
              {
                backgroundColor: theme.cardBackground,
                borderColor: theme.border,
              },
            ]}
          >
            <ThemedText
              style={[
                styles.eyebrow,
                { color: theme.mutedForeground, fontFamily: Fonts?.mono },
              ]}
            >
              SESSIONS
            </ThemedText>
            <ThemedText
              style={[styles.statValue, { fontFamily: Fonts?.serif }]}
            >
              {stats.total_sessions}
            </ThemedText>
          </View>
          <View
            style={[
              styles.statCard,
              {
                backgroundColor: theme.cardBackground,
                borderColor: theme.border,
              },
            ]}
          >
            <ThemedText
              style={[
                styles.eyebrow,
                { color: theme.mutedForeground, fontFamily: Fonts?.mono },
              ]}
            >
              TODAY
            </ThemedText>
            <ThemedText
              style={[styles.statValue, { fontFamily: Fonts?.serif }]}
            >
              {stats.today_sessions}
            </ThemedText>
          </View>
          <View
            style={[
              styles.statCard,
              {
                backgroundColor: theme.cardBackground,
                borderColor: theme.border,
              },
            ]}
          >
            <ThemedText
              style={[
                styles.eyebrow,
                { color: theme.mutedForeground, fontFamily: Fonts?.mono },
              ]}
            >
              TIME
            </ThemedText>
            <ThemedText
              style={[styles.statValue, { fontFamily: Fonts?.serif }]}
            >
              {Math.round(stats.total_duration_ms / 1000)}s
            </ThemedText>
          </View>
        </View>
      )}

      <View
        style={[
          styles.searchContainer,
          {
            backgroundColor: theme.cardBackground,
            borderColor: theme.border,
          },
        ]}
      >
        <Icon name="search" size={14} color={theme.mutedForeground} />
        <TextInput
          style={[styles.searchInput, { color: theme.text }]}
          placeholder="Search transcriptions..."
          placeholderTextColor={theme.mutedForeground}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      <FlatList
        data={entries}
        renderItem={renderEntry}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <View style={[styles.emptyIcon, { backgroundColor: theme.accent }]}>
              <Icon name="clock" size={28} color={theme.primary} />
            </View>
            <ThemedText
              style={[styles.emptyTitle, { fontFamily: Fonts?.serif }]}
            >
              No transcriptions yet
            </ThemedText>
            <ThemedText
              style={[styles.emptySubtext, { color: theme.mutedForeground }]}
            >
              Hold the mic button to start dictating
            </ThemedText>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.two,
  },
  title: {
    fontSize: 32,
    fontWeight: "400",
    fontStyle: "italic",
  },
  statsRow: {
    flexDirection: "row",
    paddingHorizontal: Spacing.four,
    gap: Spacing.two,
    marginBottom: Spacing.three,
  },
  statCard: {
    flex: 1,
    borderRadius: 11,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 1.4,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  statValue: {
    fontSize: 28,
    fontWeight: "400",
    fontStyle: "italic",
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: Spacing.four,
    marginBottom: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radius.lg,
    gap: Spacing.two,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    paddingVertical: 2,
  },
  list: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.six,
  },
  entryCard: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    padding: Spacing.three + 2,
    marginBottom: Spacing.two,
  },
  entryHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.two,
  },
  entryTime: {
    fontSize: 11,
    letterSpacing: 0.5,
  },
  entryMeta: {
    flexDirection: "row",
    gap: Spacing.two,
    alignItems: "center",
  },
  modelBadge: {
    fontSize: 9,
    letterSpacing: 1.2,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    overflow: "hidden",
  },
  entryText: {
    fontSize: 15,
    lineHeight: 23,
  },
  entryActions: {
    flexDirection: "row",
    gap: Spacing.two,
    marginTop: Spacing.three,
  },
  entryAction: {
    paddingHorizontal: Spacing.three,
    paddingVertical: 6,
    borderRadius: Radius.md,
  },
  entryActionText: {
    color: "#FBF8EE",
    fontSize: 12.5,
    fontWeight: "500",
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: Spacing.six,
    gap: Spacing.three,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: "400",
    fontStyle: "italic",
  },
  emptySubtext: {
    fontSize: 14,
    textAlign: "center",
  },
});
