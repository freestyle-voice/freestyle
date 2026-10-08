import {
  type AgentThreadActivity,
  subscribeToAgentThreadActivity,
} from "@renderer/lib/agent-message-queue";
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
  createThread,
  deleteThread as deleteStoredThread,
  reconcileThreadSummaryTitle,
  renameLocalThread,
  type ThreadState,
  type ThreadSummary,
} from "@renderer/lib/threads";
import { useRemixAvailability } from "@renderer/lib/use-remix-availability";
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
// generated one. This is one deferred observation, never a retry loop.
const THREAD_TITLE_REFRESH_DELAYS = [5_000] as const;

type RemixSessionContextValue = {
  thread: ThreadState | null;
  workspaceSurface: RemixWorkspaceSurface;
  openChat: () => void;
  openScheduledTasks: () => void;
  openCapabilities: () => void;
  switchThread: (thread: ThreadState) => void;
  updateThreadMessages: (id: string, messages: ThreadState["messages"]) => void;
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
  renameThread: (
    threadId: string,
    title: string,
    type?: "local" | "remote",
  ) => Promise<void>;
  requestDeleteThread: (
    threadId: string,
    title: string,
    type?: "local" | "remote",
  ) => void;
};

type ThreadDeletionVariables = {
  threadId: string;
  type: "local" | "remote";
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
    type: "local" | "remote";
  } | null>(null);
  const queryClient = useQueryClient();
  const availability = useRemixAvailability();
  const {
    canChat,
    canUseCloud: canRequestData,
    historyType,
    sessionScope,
  } = availability;
  const scopeRef = useRef(sessionScope);
  scopeRef.current = sessionScope;
  const latestQuery = useQuery({
    ...latestThreadQueryOptions(historyType),
    enabled: canChat,
  });
  const selectionRef = useRef(0);
  const deletionVersionRef = useRef(0);
  const selectedSummaryRef = useRef<ThreadSummary | null>(null);
  const activeSessionIdsRef = useRef<Set<string>>(new Set());
  const selectedThreadIdRef = useRef<string | null>(null);
  const cloudAccountRef = useRef(availability.cloudAccountId);
  const titleRefreshTimersRef = useRef<Map<string, number[]>>(new Map());
  selectedThreadIdRef.current = thread?.id ?? null;

  useEffect(() => {
    if (cloudAccountRef.current === availability.cloudAccountId) return;
    cloudAccountRef.current = availability.cloudAccountId;
    if (!availability.cloudAccountId) setWorkspaceSurface("chat");
    if (thread && thread.type !== "local") {
      selectionRef.current += 1;
      setThread(null);
      setLoadingThreadId(null);
      setThreadLoadError(null);
    }
    setSessionActivity({});
    setCompletedSessionIds(new Set());
    activeSessionIdsRef.current = new Set();
  }, [availability.cloudAccountId, thread]);

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

  // A chat can unmount while Settings is open. Retain its completed messages
  // in the session owner so returning to the workspace restores the transcript.
  const updateThreadMessages = useCallback(
    (id: string, messages: ThreadState["messages"]) => {
      setThread((current) =>
        current?.id === id ? { ...current, messages } : current,
      );
    },
    [],
  );

  /**
   * Switching conversations should feel like navigation, not a network wait.
   * Install the summary as a temporary thread immediately so its title and
   * selected sidebar state update in the same paint, then replace it with the
   * durable message detail once the background request resolves.
   */
  const selectThread = useCallback(
    (summary: ThreadSummary) => {
      if (!availability.canOpenThread(summary.type)) return;
      openChat();
      const scope = sessionScope;
      const selection = ++selectionRef.current;
      selectedSummaryRef.current = summary;
      setThreadLoadError(null);
      markSessionSeen(summary.id);

      const cached = queryClient.getQueryData<ThreadState>(
        queryKeys.threads.detail(summary.id, summary.type ?? "remote"),
      );
      if (cached) {
        const reconciled = reconcileThreadSummaryTitle(cached, summary);
        queryClient.setQueryData(
          queryKeys.threads.detail(summary.id, summary.type ?? "remote"),
          reconciled,
        );
        setLoadingThreadId(null);
        setThread(reconciled);
      } else {
        setLoadingThreadId(summary.id);
        setThread({
          id: summary.id,
          type: summary.type ?? "remote",
          title: summary.title,
          messages: [],
        });
      }

      void queryClient
        .fetchQuery(threadQueryOptions(summary.id, summary.type ?? "remote"))
        .then((loaded) => {
          if (!loaded) throw new Error("Conversation not found.");
          if (selectionRef.current !== selection || scopeRef.current !== scope)
            return;
          const reconciled = reconcileThreadSummaryTitle(loaded, summary);
          queryClient.setQueryData(
            queryKeys.threads.detail(summary.id, summary.type ?? "remote"),
            reconciled,
          );
          setThread(reconciled);
          setLoadingThreadId(null);
        })
        .catch(() => {
          if (selectionRef.current !== selection || scopeRef.current !== scope)
            return;
          setLoadingThreadId(null);
          // Cached detail remains a usable conversation if its quiet
          // background refresh fails; only an uncached selection needs an
          // interrupting retry state.
          if (cached) return;
          setThreadLoadError("Couldn’t load this conversation. Try again.");
        });
    },
    [
      availability.canOpenThread,
      sessionScope,
      markSessionSeen,
      openChat,
      queryClient,
    ],
  );

  const retryThreadLoad = useCallback(() => {
    const summary = selectedSummaryRef.current;
    if (summary) selectThread(summary);
    else {
      setThreadLoadError(null);
      void latestQuery.refetch();
    }
  }, [selectThread, latestQuery.refetch]);

  const creatingRef = useRef(false);
  const [creating, setCreating] = useState(false);
  const startNewThread = useCallback(() => {
    if (!canChat || creatingRef.current) return;
    const scope = sessionScope;
    const selection = ++selectionRef.current;
    creatingRef.current = true;
    setCreating(true);
    setThreadLoadError(null);
    setLoadingThreadId("creating");
    void createThread()
      .then((next) => {
        if (scopeRef.current === scope && selectionRef.current === selection) {
          switchThread(next);
          void invalidateThreads(queryClient);
        }
      })
      .catch(() => {
        if (scopeRef.current === scope && selectionRef.current === selection)
          setThreadLoadError("Couldn’t start a new conversation.");
      })
      .finally(() => {
        creatingRef.current = false;
        setCreating(false);
        if (scopeRef.current === scope && selectionRef.current === selection)
          setLoadingThreadId(null);
      });
  }, [canChat, sessionScope, switchThread, queryClient]);

  useEffect(() => {
    selectionRef.current += 1;
    selectedSummaryRef.current = null;
    setThread(null);
    setWorkspaceSurface("chat");
    setLoadingThreadId(null);
    setThreadLoadError(null);
    if (!sessionScope) {
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
  }, [sessionScope]);

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

  const renameThread = useCallback(
    async (threadId: string, title: string, type?: "local" | "remote") => {
      const nextTitle = title.trim();
      if (!nextTitle) return;
      const resolvedType =
        type ??
        (thread?.id === threadId ? (thread.type ?? "remote") : "remote");
      if (resolvedType === "local") {
        await renameLocalThread(threadId, nextTitle);
        setThread((current) =>
          current?.id === threadId ? { ...current, title: nextTitle } : current,
        );
        await invalidateThreads(queryClient);
        return;
      }
      setLocalTitles((titles) => ({ ...titles, [threadId]: nextTitle }));
      const saved = await window.api?.setRemixSessionTitle?.(
        threadId,
        nextTitle,
      );
      if (!saved) throw new Error("Could not save the session name.");
    },
    [queryClient, thread?.id, thread?.type],
  );

  const refreshThread = useCallback(
    async (threadId: string) => {
      const type =
        thread?.id === threadId ? (thread.type ?? "remote") : "remote";
      const loaded = await queryClient.fetchQuery(
        threadQueryOptions(threadId, type),
      );
      if (!loaded) return;
      const summary =
        selectedSummaryRef.current?.id === threadId
          ? selectedSummaryRef.current
          : undefined;
      const reconciled = reconcileThreadSummaryTitle(loaded, summary);
      queryClient.setQueryData(
        queryKeys.threads.detail(threadId, type),
        reconciled,
      );
      setThread((current) => (current?.id === threadId ? reconciled : current));
    },
    [queryClient, thread?.id, thread?.type],
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
    mutationFn: ({ threadId, type }: ThreadDeletionVariables) =>
      deleteStoredThread(threadId, type),
    onMutate: async ({ threadId, type, selected, localTitles }) => {
      // A late session-list response was able to repaint the just-deleted row
      // because the old version changed cache data before cancellation had
      // settled. Await it here, where React Query guarantees this mutation's
      // lifecycle ordering.
      await queryClient.cancelQueries({ queryKey: queryKeys.threads.all });
      const snapshot = optimisticallyDeleteThread(
        queryClient,
        threadId,
        localTitles,
        type,
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
        startNewThread();
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
    onError: (_error, { threadId, type }, context) => {
      if (!context) return;
      // A newer delete has a newer cache snapshot. Do not restore this older
      // one over it; refresh from the server instead and restore only this
      // session's local display-name override.
      if (context.mutationVersion === deletionVersionRef.current) {
        restoreOptimisticallyDeletedThread(
          queryClient,
          threadId,
          context.snapshot,
          type,
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
    (threadId: string, type: "local" | "remote") => {
      const selected = thread?.id === threadId ? thread : null;
      return deleteThreadMutation.mutateAsync({
        threadId,
        type,
        selected,
        localTitles,
      });
    },
    [deleteThreadMutation, localTitles, thread],
  );

  const requestDeleteThread = useCallback(
    (threadId: string, title: string, type?: "local" | "remote") => {
      const resolvedType =
        type ??
        (thread?.id === threadId ? (thread.type ?? "remote") : "remote");
      if (shouldSkipDeletionConfirmation("session")) {
        void deleteThreadNow(threadId, resolvedType).catch(() => {});
        return;
      }
      setPendingThreadDeletion({ threadId, title, type: resolvedType });
    },
    [deleteThreadNow, thread?.id, thread?.type],
  );

  useEffect(() => {
    if (!deleteNotice) return;
    const timeout = window.setTimeout(() => setDeleteNotice(null), 5_000);
    return () => window.clearTimeout(timeout);
  }, [deleteNotice]);

  useEffect(() => {
    if (!canRequestData) return;
    const off = window.api.onPanelOpenThread((threadId) => {
      const scope = sessionScope;
      openChat();
      const selection = ++selectionRef.current;
      markSessionSeen(threadId);
      void queryClient
        .fetchQuery(threadQueryOptions(threadId, "remote"))
        .catch(() => null)
        .then((picked) => {
          if (
            !picked ||
            selectionRef.current !== selection ||
            scopeRef.current !== scope
          )
            return;
          queryClient.setQueryData(queryKeys.threads.detail(threadId), picked);
          setLoadingThreadId(null);
          setThreadLoadError(null);
          setThread(picked);
        });
    });
    return () => off?.();
  }, [canRequestData, sessionScope, markSessionSeen, openChat, queryClient]);

  useEffect(() => {
    if (!canRequestData) return;
    const off = window.api?.onPanelThreadUpdated?.((threadId) => {
      // This is an observation update, not a navigation command. If someone
      // opened the pill in the workspace and then selected another session,
      // only reconcile the selected title after the Cloud write settles. The
      // durable observer already owns message updates, so fetching the full
      // legacy thread here would duplicate its traffic.
      if (selectedThreadIdRef.current === threadId)
        requestThreadTitleRefresh(threadId);
    });
    return () => off?.();
  }, [canRequestData, requestThreadTitleRefresh]);

  useEffect(() => {
    if (
      !canChat ||
      latestQuery.isPending ||
      latestQuery.isFetching ||
      latestQuery.isError
    )
      return;
    const latestThread = latestQuery.data;
    const model =
      availability.runtime?.kind === "local"
        ? availability.runtime.model
        : null;
    const matchesModel =
      !model ||
      (latestThread?.model?.provider === model.provider &&
        latestThread.model.modelId === model.model_id);
    if (latestThread?.id && latestThread.messages && matchesModel) {
      setThread(
        (current) =>
          current ?? {
            id: latestThread.id,
            title: latestThread.title ?? null,
            messages: latestThread.messages,
            type: latestThread.type,
            model: latestThread.model,
          },
      );
      return;
    }
    if (!thread && !threadLoadError && !creating) startNewThread();
  }, [
    canChat,
    availability.runtime,
    threadLoadError,
    creating,
    latestQuery.isError,
    latestQuery.data,
    latestQuery.isPending,
    latestQuery.isFetching,
    startNewThread,
    thread,
  ]);

  const value = useMemo(
    () => ({
      thread,
      workspaceSurface,
      openChat,
      openScheduledTasks,
      openCapabilities,
      switchThread,
      updateThreadMessages,
      selectThread,
      startNewThread,
      isThreadLoading:
        loadingThreadId === "creating" || loadingThreadId === thread?.id,
      threadLoadError:
        threadLoadError ??
        (!thread && latestQuery.isError
          ? "Couldn’t load conversations. Try again."
          : null),
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
      updateThreadMessages,
      thread,
      workspaceSurface,
      threadLoadError,
      loadingThreadId,
      markSessionSeen,
      requestThreadTitleRefresh,
      completedSessionIds,
      sessionActivity,
      requestDeleteThread,
      latestQuery.isError,
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
          void deleteThreadNow(pending.threadId, pending.type).catch(() => {});
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
