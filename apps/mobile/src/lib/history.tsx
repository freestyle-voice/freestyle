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
  useRef,
  useState,
} from "react";
import { AppState } from "react-native";

import { useAuth } from "@/hooks/use-auth";
import {
  getJsonPref,
  getPref,
  removePrefs,
  setJsonPref,
  setPref,
} from "./storage";

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
export function pruneByRetention(
  entries: HistoryEntry[],
  retention: HistoryRetentionDays,
  now = Date.now(),
): HistoryEntry[] {
  if (retention === "never") return entries;
  const cutoff = now - retention * 86_400_000;
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
  const { user } = useAuth();
  const historyStorageKey = user ? `${HISTORY_KEY}:${user.id}` : HISTORY_KEY;
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [ready, setReady] = useState(false);
  const [pauseHistory, setPauseHistoryState] = useState(false);
  const [historyRetentionDays, setRetentionState] =
    useState<HistoryRetentionDays>("never");
  // Refs make rapid mutations atomic even when several callbacks run before
  // React renders the latest state. Writes are chained in the same order so an
  // older AsyncStorage write can never land after a newer one.
  const historyRef = useRef<HistoryEntry[]>([]);
  const readyRef = useRef(false);
  const pauseHistoryRef = useRef(false);
  const retentionRef = useRef<HistoryRetentionDays>("never");
  const historyKeyRef = useRef(historyStorageKey);
  const writeQueueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    let cancelled = false;
    readyRef.current = false;
    setReady(false);
    (async () => {
      const [accountHistory, legacyHistory, pausedRaw, retentionRaw] =
        await Promise.all([
          getJsonPref<HistoryEntry[] | null>(historyStorageKey, null),
          getJsonPref<HistoryEntry[]>(HISTORY_KEY, []),
          getPref(PAUSE_HISTORY_KEY),
          getPref(RETENTION_KEY),
        ]);
      if (cancelled) return;
      // Claim the pre-account-key history for the currently signed-in account
      // once, then remove the global copy so a different account cannot see it.
      const stored = accountHistory ?? legacyHistory;
      historyKeyRef.current = historyStorageKey;
      const retention = parseRetention(retentionRaw);
      const pruned = pruneByRetention(stored, retention);
      historyRef.current = pruned;
      pauseHistoryRef.current = pausedRaw === "true";
      retentionRef.current = retention;
      setHistory(pruned);
      setPauseHistoryState(pauseHistoryRef.current);
      setRetentionState(retention);
      // Persist pruning and migrate the legacy global key without deleting its
      // only copy unless the account-scoped write succeeds.
      if (accountHistory == null) {
        try {
          await setJsonPref(historyStorageKey, pruned);
          if (historyStorageKey !== HISTORY_KEY) {
            await removePrefs([HISTORY_KEY]);
          }
        } catch {
          // Keep the legacy copy for a future migration attempt.
        }
      } else {
        if (pruned.length !== stored.length) {
          await setJsonPref(historyStorageKey, pruned).catch(() => {});
        }
        if (historyStorageKey !== HISTORY_KEY && legacyHistory.length > 0) {
          await removePrefs([HISTORY_KEY]).catch(() => {});
        }
      }
      if (cancelled) return;
      // Mutations stay blocked until migration/pruning writes finish, so an
      // early add/delete can never race and be overwritten by hydration.
      readyRef.current = true;
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [historyStorageKey]);

  const persist = useCallback((next: HistoryEntry[]) => {
    historyRef.current = next;
    setHistory(next);
    const storageKey = historyKeyRef.current;
    writeQueueRef.current = writeQueueRef.current
      .catch(() => {
        // Keep the queue usable after a transient storage failure.
      })
      .then(() => setJsonPref(storageKey, next))
      .catch(() => {
        // History remains correct in memory; a later mutation retries a full
        // snapshot. Storage failures must never break dictation.
      });
  }, []);

  const setPauseHistory = useCallback((paused: boolean) => {
    if (!readyRef.current) return;
    pauseHistoryRef.current = paused;
    setPauseHistoryState(paused);
    void setPref(PAUSE_HISTORY_KEY, String(paused)).catch(() => {});
  }, []);

  const setHistoryRetentionDays = useCallback(
    (days: HistoryRetentionDays) => {
      if (!readyRef.current) return;
      retentionRef.current = days;
      setRetentionState(days);
      void setPref(RETENTION_KEY, String(days)).catch(() => {});
      // Apply the new cutoff immediately so toggling prunes without waiting
      // for the next dictation.
      const pruned = pruneByRetention(historyRef.current, days);
      if (pruned.length !== historyRef.current.length) persist(pruned);
    },
    [persist],
  );

  // Enforce retention again whenever the app returns to the foreground. This
  // covers long-running sessions where entries expire without a new dictation.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active" || !readyRef.current) return;
      const pruned = pruneByRetention(historyRef.current, retentionRef.current);
      if (pruned.length !== historyRef.current.length) persist(pruned);
    });
    return () => subscription.remove();
  }, [persist]);

  const value = useMemo<HistoryContextValue>(
    () => ({
      history,
      ready,
      pauseHistory,
      historyRetentionDays,
      addHistory: (text, durationMs) => {
        // Dropping a completion during the very short hydration window is
        // preferable to violating a persisted "Pause history" choice.
        if (!readyRef.current || pauseHistoryRef.current) return;
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
          [entry, ...historyRef.current],
          retentionRef.current,
        ).slice(0, HISTORY_MAX);
        persist(next);
      },
      removeHistory: (id) => {
        if (!readyRef.current) return;
        persist(historyRef.current.filter((e) => e.id !== id));
      },
      clearHistory: () => {
        if (!readyRef.current) return;
        persist([]);
      },
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

/** Count Unicode word-like segments, with a whitespace fallback. */
export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  if (typeof Intl.Segmenter === "function") {
    const segments = new Intl.Segmenter(undefined, {
      granularity: "word",
    }).segment(trimmed);
    let count = 0;
    for (const segment of segments) {
      if (segment.isWordLike) count += 1;
    }
    return count;
  }
  return trimmed.split(/\s+/).length;
}

export interface HistoryStats {
  totalSessions: number;
  totalWords: number;
  totalDurationMs: number;
  last7Sessions: number;
  last7Words: number;
  /** Words spoken per day for the last 7 days (oldest → newest). */
  last7Days: number[];
}

/** Derive aggregate stats from the in-memory history list. */
export function deriveHistoryStats(
  entries: HistoryEntry[],
  now = Date.now(),
): HistoryStats {
  const dayMs = 86_400_000;
  const todayOrdinal = localDayOrdinal(now);
  const last7Days = [0, 0, 0, 0, 0, 0, 0];

  let totalWords = 0;
  let totalDurationMs = 0;
  let last7Sessions = 0;
  let last7Words = 0;

  for (const entry of entries) {
    const words = countWords(entry.text);
    totalWords += words;
    totalDurationMs += entry.durationMs;
    // UTC ordinals derived from local calendar components avoid both the
    // "today is -1" bug and 23/25-hour DST day errors.
    const dayIndex = Math.round(
      (todayOrdinal - localDayOrdinal(entry.createdAt)) / dayMs,
    );
    // dayIndex 0 = today → slot 6; dayIndex 6 = 6 days ago → slot 0.
    if (dayIndex >= 0 && dayIndex < 7) {
      last7Days[6 - dayIndex] += words;
      last7Sessions += 1;
      last7Words += words;
    }
  }

  return {
    totalSessions: entries.length,
    totalWords,
    totalDurationMs,
    last7Sessions,
    last7Words,
    last7Days,
  };
}

/** Stable 24-hour ordinal for a local calendar date (DST-safe). */
function localDayOrdinal(timestamp: number): number {
  const date = new Date(timestamp);
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}
