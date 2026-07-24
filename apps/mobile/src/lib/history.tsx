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

import { getJsonPref, setJsonPref } from "./storage";

/** Cap the store so AsyncStorage doesn't grow unbounded; oldest pruned first. */
export const HISTORY_MAX = 500;

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

function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

interface HistoryContextValue {
  history: HistoryEntry[];
  ready: boolean;
  addHistory: (text: string, durationMs: number) => void;
  removeHistory: (id: string) => void;
  clearHistory: () => void;
}

const HistoryContext = createContext<HistoryContextValue | null>(null);

export function HistoryProvider({ children }: { children: ReactNode }) {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const stored = await getJsonPref<HistoryEntry[]>(HISTORY_KEY, []);
      setHistory(stored);
      setReady(true);
    })();
  }, []);

  const persist = useCallback((next: HistoryEntry[]) => {
    setHistory(next);
    void setJsonPref(HISTORY_KEY, next);
  }, []);

  const value = useMemo<HistoryContextValue>(
    () => ({
      history,
      ready,
      addHistory: (text, durationMs) => {
        const trimmed = text.trim();
        if (!trimmed) return;
        const entry: HistoryEntry = {
          id: newId(),
          text: trimmed,
          createdAt: Date.now(),
          durationMs,
        };
        // Newest first, capped at HISTORY_MAX (drop the oldest tail).
        persist([entry, ...history].slice(0, HISTORY_MAX));
      },
      removeHistory: (id) => persist(history.filter((e) => e.id !== id)),
      clearHistory: () => persist([]),
    }),
    [history, ready, persist],
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
