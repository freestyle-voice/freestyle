import {
  type AgentThreadActivity,
  subscribeToAgentThreadActivity,
} from "@renderer/lib/agent-message-queue";
import { useCloudAuth } from "@renderer/lib/auth-context";
import {
  setDeletionConfirmationSkipped,
  shouldSkipDeletionConfirmation,
} from "@renderer/lib/deletion-confirmation";
import {
  invalidateThreads,
  latestThreadQueryOptions,
  optimisticallyDeleteThread,
  queryKeys,
  restoreOptimisticallyDeletedThread,
  threadQueryOptions,
} from "@renderer/lib/query";
import {
  deleteThread as deleteStoredThread,
  getThread,
  type ThreadState,
  type ThreadSummary,
} from "@renderer/lib/threads";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { DeleteConfirmationDialog } from "./delete-confirmation-dialog";

export type RemixWorkspaceSurface = "chat" | "scheduled" | "capabilities";

/** A schedule has its own navigation surface, so no chat row is current. */
export function sidebarCurrentThreadId(
  surface: RemixWorkspaceSurface,
  threadId: string,
): string {
  return surface === "chat" ? threadId : "";
}

// Cloud first persists a deterministic title, then replaces it with a short
// generated one. These are bounded observations of that background write, not
// polling: they run only for an unnamed conversation after its first turn.
const THREAD_TITLE_REFRESH_DELAYS = [1_200, 4_000] as const;

type RemixSessionContextValue = {
  thread: ThreadState | null;
  workspaceSurface: RemixWorkspaceSurface;
  openChat: () => void;
  openScheduledTasks: () => void;
  openCapabilities: () => void;
  switchThread: (thread: ThreadState) => void;
  selectThread: (thread: ThreadSummary) => void;
  startNewThread: () => void;
  isThreadLoading: boolean;
  threadLoadError: string | null;
  retryThreadLoad: () => void;
  localTitles: Record<string, string>;
  /** Local Hono owns live turn state; Cloud remains the durable session list. */
  sessionActivity: Record<string, AgentThreadActivity>;
  /** A completed response from a session the user has not re-opened yet. */
  completedSessionIds: ReadonlySet<string>;
  markSessionSeen: (threadId: string) => void;
  requestThreadTitleRefresh: (threadId: string) => void;
  renameThread: (threadId: string, title: string) => Promise<void>;
  requestDeleteThread: (threadId: string, title: string) => void;
};

type ThreadDeletionVariables = {
  threadId: string;
  selected: ThreadState | null;
  localTitles: Record<string, string>;
};

type ThreadDeletionContext = {
  snapshot: ReturnType<typeof optimisticallyDeleteThread>;
  replacementSelection: number | null;
  mutationVersion: number;
};

const RemixSessionContext = createContext<RemixSessionContextValue | null>(
  null,
);

function newThread(): ThreadState {
  return { id: crypto.randomUUID(), messages: [] };
}

/**
 * One source of truth for the selected Remix thread. The app sidebar and the
 * right-hand agent canvas can therefore present the same sessions without
 * becoming two independent navigation surfaces.
 */
export function RemixSessionProvider({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  const [thread, setThread] = useState<ThreadState | null>(null);
  const [workspaceSurface, setWorkspaceSurface] =
    useState<RemixWorkspaceSurface>("chat");
  const [loadingThreadId, setLoadingThreadId] = useState<string | null>(null);
  const [threadLoadError, setThreadLoadError] = useState<string | null>(null);
  const [localTitles, setLocalTitles] = useState<Record<string, string>>({});
  const [sessionActivity, setSessionActivity] = useState<
    Record<string, AgentThreadActivity>
  >({});
  const [completedSessionIds, setCompletedSessionIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [deleteNotice, setDeleteNotice] = useState<string | null>(null);
  const [pendingThreadDeletion, setPendingThreadDeletion] = useState<{
    threadId: string;
    title: string;
  } | null>(null);
  const queryClient = useQueryClient();
  const { canRequestData, phase } = useCloudAuth();
  const latestQuery = useQuery({
    ...latestThreadQueryOptions(),
    enabled: canRequestData,
  });
  const selectionRef = useRef(0);
  const deletionVersionRef = useRef(0);
  const selectedSummaryRef = useRef<ThreadSummary | null>(null);
  const activeSessionIdsRef = useRef<Set<string>>(new Set());
  const selectedThreadIdRef = useRef<string | null>(null);
  const titleRefreshTimersRef = useRef<Map<string, number[]>>(new Map());
  selectedThreadIdRef.current = thread?.id ?? null;

  const markSessionSeen = useCallback((threadId: string) => {
    setCompletedSessionIds((current) => {
      if (!current.has(threadId)) return current;
      const next = new Set(current);
      next.delete(threadId);
      return next;
    });
  }, []);

  const openScheduledTasks = useCallback(() => {
    setWorkspaceSurface("scheduled");
  }, []);

  const openCapabilities = useCallback(() => {
    setWorkspaceSurface("capabilities");
  }, []);

  const openChat = useCallback(() => {
    setWorkspaceSurface("chat");
  }, []);

  const switchThread = useCallback(
    (next: ThreadState) => {
      openChat();
      selectionRef.current += 1;
      selectedSummaryRef.current = null;
      setLoadingThreadId(null);
      setThreadLoadError(null);
      markSessionSeen(next.id);
      setThread(next);
    },
    [markSessionSeen, openChat],
  );

  /**
   * Switching conversations should feel like navigation, not a network wait.
   * Install the summary as a temporary thread immediately so its title and
   * selected sidebar state update in the same paint, then replace it with the
   * durable message detail once the background request resolves.
   */
  const selectThread = useCallback(
    (summary: ThreadSummary) => {
      openChat();
      const selection = ++selectionRef.current;
      selectedSummaryRef.current = summary;
      setThreadLoadError(null);
      markSessionSeen(summary.id);

      const cached = queryClient.getQueryData<ThreadState>(
        queryKeys.threads.detail(summary.id),
      );
      if (cached) {
        setLoadingThreadId(null);
        setThread(cached);
      } else {
        setLoadingThreadId(summary.id);
        setThread({ id: summary.id, title: summary.title, messages: [] });
      }

      void queryClient
        .fetchQuery(threadQueryOptions(summary.id))
        .then((loaded) => {
          if (!loaded) throw new Error("Conversation not found.");
          if (selectionRef.current !== selection) return;
          queryClient.setQueryData(
            queryKeys.threads.detail(summary.id),
            loaded,
          );
          setThread(loaded);
          setLoadingThreadId(null);
        })
        .catch(() => {
          if (selectionRef.current !== selection) return;
          setLoadingThreadId(null);
          // Cached detail remains a usable conversation if its quiet
          // background refresh fails; only an uncached selection needs an
          // interrupting retry state.
          if (cached) return;
          setThreadLoadError("Couldn’t load this conversation. Try again.");
        });
    },
    [markSessionSeen, openChat, queryClient],
  );

  const retryThreadLoad = useCallback(() => {
    const summary = selectedSummaryRef.current;
    if (summary) selectThread(summary);
  }, [selectThread]);

  const startNewThread = useCallback(
    () => switchThread(newThread()),
    [switchThread],
  );

  useEffect(() => {
    if (phase === "signed_out") {
      setThread(null);
      setWorkspaceSurface("chat");
      setLoadingThreadId(null);
      setThreadLoadError(null);
      setLocalTitles({});
      setSessionActivity({});
      setCompletedSessionIds(new Set());
      activeSessionIdsRef.current = new Set();
      return;
    }
    // Development can briefly run a renderer compiled against a newer preload.
    // Keep the workspace usable until Electron reloads its preload bridge.
    void window.api
      ?.getRemixSessionTitles?.()
      .then((titles) => setLocalTitles(titles))
      .catch(() => {});
  }, [phase]);

  useEffect(() => {
    if (!canRequestData) return;
    return subscribeToAgentThreadActivity(({ threads: entries }) => {
      const next = Object.fromEntries(
        entries.map((entry) => [entry.threadId, entry]),
      );
      const activeIds = new Set(
        entries
          .filter((entry) => entry.active || entry.queuedCount > 0)
          .map((entry) => entry.threadId),
      );
      const completed = [...activeSessionIdsRef.current].filter(
        (threadId) =>
          !activeIds.has(threadId) && selectedThreadIdRef.current !== threadId,
      );
      activeSessionIdsRef.current = activeIds;
      setSessionActivity(next);
      if (completed.length) {
        setCompletedSessionIds((current) => {
          const nextCompleted = new Set(current);
          for (const threadId of completed) nextCompleted.add(threadId);
          return nextCompleted;
        });
      }
    });
  }, [canRequestData]);

  const renameThread = useCallback(async (threadId: string, title: string) => {
    const nextTitle = title.trim();
    if (!nextTitle) return;
    setLocalTitles((titles) => ({ ...titles, [threadId]: nextTitle }));
    const saved = await window.api?.setRemixSessionTitle?.(threadId, nextTitle);
    if (!saved) throw new Error("Could not save the session name.");
  }, []);

  const refreshThread = useCallback(
    async (threadId: string) => {
      const loaded = await queryClient.fetchQuery(threadQueryOptions(threadId));
      if (!loaded) return;
      queryClient.setQueryData(queryKeys.threads.detail(threadId), loaded);
      setThread((current) => (current?.id === threadId ? loaded : current));
      await invalidateThreads(queryClient);
    },
    [queryClient],
  );

  const requestThreadTitleRefresh = useCallback(
    (threadId: string) => {
      if (titleRefreshTimersRef.current.has(threadId)) return;
      const timers = THREAD_TITLE_REFRESH_DELAYS.map((delay, index) =>
        window.setTimeout(() => {
          void refreshThread(threadId).catch(() => {});
          if (index === THREAD_TITLE_REFRESH_DELAYS.length - 1) {
            titleRefreshTimersRef.current.delete(threadId);
          }
        }, delay),
      );
      titleRefreshTimersRef.current.set(threadId, timers);
    },
    [refreshThread],
  );

  useEffect(
    () => () => {
      for (const timers of titleRefreshTimersRef.current.values()) {
        for (const timer of timers) window.clearTimeout(timer);
      }
      titleRefreshTimersRef.current.clear();
    },
    [],
  );

  const deleteThreadMutation = useMutation<
    void,
    Error,
    ThreadDeletionVariables,
    ThreadDeletionContext
  >({
    mutationFn: ({ threadId }: ThreadDeletionVariables) =>
      deleteStoredThread(threadId),
    onMutate: async ({ threadId, selected, localTitles }) => {
      // A late session-list response was able to repaint the just-deleted row
      // because the old version changed cache data before cancellation had
      // settled. Await it here, where React Query guarantees this mutation's
      // lifecycle ordering.
      await queryClient.cancelQueries({ queryKey: queryKeys.threads.all });
      const snapshot = optimisticallyDeleteThread(
        queryClient,
        threadId,
        localTitles,
      );
      setLocalTitles((current) => {
        const next = { ...current };
        delete next[threadId];
        return next;
      });
      setSessionActivity((current) => {
        if (!current[threadId]) return current;
        const next = { ...current };
        delete next[threadId];
        return next;
      });
      setCompletedSessionIds((current) => {
        if (!current.has(threadId)) return current;
        const next = new Set(current);
        next.delete(threadId);
        return next;
      });
      activeSessionIdsRef.current.delete(threadId);

      let replacementSelection: number | null = null;
      if (selected) {
        switchThread(newThread());
        replacementSelection = selectionRef.current;
      }
      deletionVersionRef.current += 1;
      return {
        snapshot,
        replacementSelection,
        mutationVersion: deletionVersionRef.current,
      };
    },
    onSuccess: (_result, { threadId }) => {
      void window.api?.setRemixSessionTitle?.(threadId, null);
    },
    onError: (_error, { threadId }, context) => {
      if (!context) return;
      // A newer delete has a newer cache snapshot. Do not restore this older
      // one over it; refresh from the server instead and restore only this
      // session's local display-name override.
      if (context.mutationVersion === deletionVersionRef.current) {
        restoreOptimisticallyDeletedThread(
          queryClient,
          threadId,
          context.snapshot,
        );
      }
      const previousTitle = context.snapshot.localTitles[threadId];
      if (previousTitle) {
        setLocalTitles((current) => ({
          ...current,
          [threadId]: previousTitle,
        }));
      }
      if (
        context.mutationVersion === deletionVersionRef.current &&
        context.replacementSelection === selectionRef.current
      ) {
        const restored = context.snapshot.detail;
        if (restored) switchThread(restored);
      }
      setDeleteNotice("Couldn’t delete this session. It has been restored.");
    },
    onSettled: () => {
      void invalidateThreads(queryClient);
    },
  });

  const deleteThreadNow = useCallback(
    (threadId: string) => {
      const selected = thread?.id === threadId ? thread : null;
      return deleteThreadMutation.mutateAsync({
        threadId,
        selected,
        localTitles,
      });
    },
    [deleteThreadMutation, localTitles, thread],
  );

  const requestDeleteThread = useCallback(
    (threadId: string, title: string) => {
      if (shouldSkipDeletionConfirmation("session")) {
        void deleteThreadNow(threadId).catch(() => {});
        return;
      }
      setPendingThreadDeletion({ threadId, title });
    },
    [deleteThreadNow],
  );

  useEffect(() => {
    if (!deleteNotice) return;
    const timeout = window.setTimeout(() => setDeleteNotice(null), 5_000);
    return () => window.clearTimeout(timeout);
  }, [deleteNotice]);

  useEffect(() => {
    if (!canRequestData) return;
    const off = window.api.onPanelOpenThread((threadId) => {
      openChat();
      const selection = ++selectionRef.current;
      void invalidateThreads(queryClient);
      markSessionSeen(threadId);
      void getThread(threadId)
        .catch(() => null)
        .then((picked) => {
          if (!picked || selectionRef.current !== selection) return;
          queryClient.setQueryData(queryKeys.threads.detail(threadId), picked);
          setLoadingThreadId(null);
          setThreadLoadError(null);
          setThread(picked);
        });
    });
    return () => off?.();
  }, [canRequestData, markSessionSeen, openChat, queryClient]);

  useEffect(() => {
    if (!canRequestData) return;
    const off = window.api?.onPanelThreadUpdated?.((threadId) => {
      // This is an observation update, not a navigation command. If someone
      // opened the pill in the workspace and then selected another session,
      // refresh the cache without pulling them back to the old thread.
      void refreshThread(threadId).catch(() => {});
      requestThreadTitleRefresh(threadId);
    });
    return () => off?.();
  }, [canRequestData, refreshThread, requestThreadTitleRefresh]);

  useEffect(() => {
    if (latestQuery.isPending) return;
    setThread((current) => current ?? latestQuery.data ?? newThread());
  }, [latestQuery.data, latestQuery.isPending]);

  const value = useMemo(
    () => ({
      thread,
      workspaceSurface,
      openChat,
      openScheduledTasks,
      openCapabilities,
      switchThread,
      selectThread,
      startNewThread,
      isThreadLoading: loadingThreadId === thread?.id,
      threadLoadError,
      retryThreadLoad,
      localTitles,
      sessionActivity,
      completedSessionIds,
      markSessionSeen,
      requestThreadTitleRefresh,
      renameThread,
      requestDeleteThread,
    }),
    [
      localTitles,
      openChat,
      openCapabilities,
      openScheduledTasks,
      renameThread,
      retryThreadLoad,
      selectThread,
      startNewThread,
      switchThread,
      thread,
      workspaceSurface,
      threadLoadError,
      loadingThreadId,
      markSessionSeen,
      requestThreadTitleRefresh,
      completedSessionIds,
      sessionActivity,
      requestDeleteThread,
    ],
  );

  return (
    <RemixSessionContext.Provider value={value}>
      {children}
      {deleteNotice ? (
        <div
          className="fixed right-5 bottom-5 z-50 max-w-80 rounded-[10px] border border-destructive/45 bg-background/95 px-3 py-2.5 text-sm text-foreground shadow-xl backdrop-blur-sm"
          role="status"
          aria-live="polite"
        >
          {deleteNotice}
        </div>
      ) : null}
      <DeleteConfirmationDialog
        open={pendingThreadDeletion !== null}
        scope="session"
        title={
          pendingThreadDeletion
            ? `Delete ${pendingThreadDeletion.title}?`
            : "Delete session?"
        }
        description="This permanently removes the conversation."
        confirmLabel="Delete session"
        onOpenChange={(open) => {
          if (!open) setPendingThreadDeletion(null);
        }}
        onConfirm={(skipConfirmation) => {
          const pending = pendingThreadDeletion;
          setPendingThreadDeletion(null);
          if (!pending) return;
          if (skipConfirmation) setDeletionConfirmationSkipped("session", true);
          void deleteThreadNow(pending.threadId).catch(() => {});
        }}
      />
    </RemixSessionContext.Provider>
  );
}

export function useRemixSession(): RemixSessionContextValue {
  const context = useContext(RemixSessionContext);
  if (!context)
    throw new Error("useRemixSession must be used within RemixSessionProvider");
  return context;
}
