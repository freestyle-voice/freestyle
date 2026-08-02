/**
 * Local dictation history for mobile.
 *
 * Freestyle Cloud has no per-user transcription history API — the desktop's
 * `/api/history` is a local SQLite store embedded in Electron, and the cloud
 * only tracks a credit-usage ledger (no transcript text). So mobile keeps its
 * own lightweight history in AsyncStorage: every successful dictation is saved
 * with the final (post-cleanup, post-dictionary) text, a timestamp, and the
 * recording duration. That's all the client has — voice/LLM model, tokens, and
 * cost live server-side and never come back over the wire.
 *
 * Privacy controls (`pauseHistory`, `historyRetentionDays`) are also device-
 * local: pause skips new saves, and retention prunes entries older than the
 * cutoff on load and on each add.
 */

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { getJsonPref, getPref, setJsonPref, setPref } from "./storage";

/** Cap the store so AsyncStorage doesn't grow unbounded; oldest pruned first. */
export const HISTORY_MAX = 500;

export type HistoryRetentionDays = "never" | 7 | 30;

export interface HistoryEntry {
  id: string;
  /** Final transcript, after cloud cleanup and local dictionary replacement. */
  text: string;
  /** Unix epoch (ms) when the dictation completed. */
  createdAt: number;
  /** Recording length in milliseconds. */
  durationMs: number;
}

const HISTORY_KEY = "history";
const PAUSE_HISTORY_KEY = "history_paused";
const RETENTION_KEY = "history_retention_days";

function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function parseRetention(raw: string | null): HistoryRetentionDays {
  if (raw === "7") return 7;
  if (raw === "30") return 30;
  return "never";
}

/** Drop entries older than the retention window. `"never"` is a no-op. */
function pruneByRetention(
  entries: HistoryEntry[],
  retention: HistoryRetentionDays,
): HistoryEntry[] {
  if (retention === "never") return entries;
  const cutoff = Date.now() - retention * 86_400_000;
  return entries.filter((e) => e.createdAt >= cutoff);
}

interface HistoryContextValue {
  history: HistoryEntry[];
  ready: boolean;
  pauseHistory: boolean;
  historyRetentionDays: HistoryRetentionDays;
  addHistory: (text: string, durationMs: number) => void;
  removeHistory: (id: string) => void;
  clearHistory: () => void;
  setPauseHistory: (paused: boolean) => void;
  setHistoryRetentionDays: (days: HistoryRetentionDays) => void;
}

const HistoryContext = createContext<HistoryContextValue | null>(null);

export function HistoryProvider({ children }: { children: ReactNode }) {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [ready, setReady] = useState(false);
  const [pauseHistory, setPauseHistoryState] = useState(false);
  const [historyRetentionDays, setRetentionState] =
    useState<HistoryRetentionDays>("never");

  useEffect(() => {
    (async () => {
      const [stored, pausedRaw, retentionRaw] = await Promise.all([
        getJsonPref<HistoryEntry[]>(HISTORY_KEY, []),
        getPref(PAUSE_HISTORY_KEY),
        getPref(RETENTION_KEY),
      ]);
      const retention = parseRetention(retentionRaw);
      const pruned = pruneByRetention(stored, retention);
      setHistory(pruned);
      setPauseHistoryState(pausedRaw === "true");
      setRetentionState(retention);
      setReady(true);
      // Persist the pruned list if retention dropped anything on cold start.
      if (pruned.length !== stored.length) {
        void setJsonPref(HISTORY_KEY, pruned);
      }
    })();
  }, []);

  const persist = useCallback((next: HistoryEntry[]) => {
    setHistory(next);
    void setJsonPref(HISTORY_KEY, next);
  }, []);

  const setPauseHistory = useCallback((paused: boolean) => {
    setPauseHistoryState(paused);
    void setPref(PAUSE_HISTORY_KEY, String(paused));
  }, []);

  const setHistoryRetentionDays = useCallback((days: HistoryRetentionDays) => {
    setRetentionState(days);
    void setPref(RETENTION_KEY, String(days));
    // Apply the new cutoff immediately so toggling prunes without waiting
    // for the next dictation.
    setHistory((prev) => {
      const pruned = pruneByRetention(prev, days);
      if (pruned.length !== prev.length) {
        void setJsonPref(HISTORY_KEY, pruned);
        return pruned;
      }
      return prev;
    });
  }, []);

  const value = useMemo<HistoryContextValue>(
    () => ({
      history,
      ready,
      pauseHistory,
      historyRetentionDays,
      addHistory: (text, durationMs) => {
        if (pauseHistory) return;
        const trimmed = text.trim();
        if (!trimmed) return;
        const entry: HistoryEntry = {
          id: newId(),
          text: trimmed,
          createdAt: Date.now(),
          durationMs,
        };
        // Newest first, retention-pruned, then capped at HISTORY_MAX.
        const next = pruneByRetention(
          [entry, ...history],
          historyRetentionDays,
        ).slice(0, HISTORY_MAX);
        persist(next);
      },
      removeHistory: (id) => persist(history.filter((e) => e.id !== id)),
      clearHistory: () => persist([]),
      setPauseHistory,
      setHistoryRetentionDays,
    }),
    [
      history,
      ready,
      pauseHistory,
      historyRetentionDays,
      persist,
      setPauseHistory,
      setHistoryRetentionDays,
    ],
  );

  return (
    <HistoryContext.Provider value={value}>{children}</HistoryContext.Provider>
  );
}

/** Access dictation history. Must be used under a `HistoryProvider`. */
export function useHistory(): HistoryContextValue {
  const ctx = useContext(HistoryContext);
  if (!ctx) {
    throw new Error("useHistory must be used within a HistoryProvider");
  }
  return ctx;
}

/** Count whitespace-separated words in a transcript. */
export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

export interface HistoryStats {
  totalSessions: number;
  totalWords: number;
  totalDurationMs: number;
  weekSessions: number;
  weekWords: number;
  /** Words spoken per day for the last 7 days (oldest → newest). */
  last7Days: number[];
}

/** Derive aggregate stats from the in-memory history list. */
export function deriveHistoryStats(
  entries: HistoryEntry[],
  now = Date.now(),
): HistoryStats {
  const weekAgo = now - 7 * 86_400_000;
  const dayMs = 86_400_000;
  // Bucket boundaries: start of today local time, then walk back 6 days.
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const todayStart = startOfToday.getTime();
  const last7Days = [0, 0, 0, 0, 0, 0, 0];

  let totalWords = 0;
  let totalDurationMs = 0;
  let weekSessions = 0;
  let weekWords = 0;

  for (const entry of entries) {
    const words = countWords(entry.text);
    totalWords += words;
    totalDurationMs += entry.durationMs;
    if (entry.createdAt >= weekAgo) {
      weekSessions += 1;
      weekWords += words;
    }
    const dayIndex = Math.floor((todayStart - entry.createdAt) / dayMs);
    // dayIndex 0 = today → slot 6; dayIndex 6 = 6 days ago → slot 0.
    if (dayIndex >= 0 && dayIndex < 7) {
      last7Days[6 - dayIndex] += words;
    }
  }

  return {
    totalSessions: entries.length,
    totalWords,
    totalDurationMs,
    weekSessions,
    weekWords,
    last7Days,
  };
}
