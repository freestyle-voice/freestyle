import { useCloudAuth } from "@renderer/lib/auth-context";
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

type RemixSessionContextValue = {
  thread: ThreadState | null;
  switchThread: (thread: ThreadState) => void;
  selectThread: (thread: ThreadSummary) => void;
  startNewThread: () => void;
  isThreadLoading: boolean;
  threadLoadError: string | null;
  retryThreadLoad: () => void;
  localTitles: Record<string, string>;
  renameThread: (threadId: string, title: string) => Promise<void>;
  deleteThread: (threadId: string) => Promise<void>;
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
  const [loadingThreadId, setLoadingThreadId] = useState<string | null>(null);
  const [threadLoadError, setThreadLoadError] = useState<string | null>(null);
  const [localTitles, setLocalTitles] = useState<Record<string, string>>({});
  const [deleteNotice, setDeleteNotice] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { user, loading } = useCloudAuth();
  const latestQuery = useQuery({
    ...latestThreadQueryOptions(),
    enabled: !loading && !!user,
  });
  const selectionRef = useRef(0);
  const deletionVersionRef = useRef(0);
  const selectedSummaryRef = useRef<ThreadSummary | null>(null);

  const switchThread = useCallback((next: ThreadState) => {
    selectionRef.current += 1;
    selectedSummaryRef.current = null;
    setLoadingThreadId(null);
    setThreadLoadError(null);
    setThread(next);
  }, []);

  /**
   * Switching conversations should feel like navigation, not a network wait.
   * Install the summary as a temporary thread immediately so its title and
   * selected sidebar state update in the same paint, then replace it with the
   * durable message detail once the background request resolves.
   */
  const selectThread = useCallback(
    (summary: ThreadSummary) => {
      const selection = ++selectionRef.current;
      selectedSummaryRef.current = summary;
      setThreadLoadError(null);

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
    [queryClient],
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
    if (loading || !user) {
      setThread(null);
      setLoadingThreadId(null);
      setThreadLoadError(null);
      setLocalTitles({});
      return;
    }
    // Development can briefly run a renderer compiled against a newer preload.
    // Keep the workspace usable until Electron reloads its preload bridge.
    void window.api
      ?.getRemixSessionTitles?.()
      .then((titles) => setLocalTitles(titles))
      .catch(() => {});
  }, [loading, user]);

  const renameThread = useCallback(async (threadId: string, title: string) => {
    const nextTitle = title.trim();
    if (!nextTitle) return;
    setLocalTitles((titles) => ({ ...titles, [threadId]: nextTitle }));
    const saved = await window.api?.setRemixSessionTitle?.(threadId, nextTitle);
    if (!saved) throw new Error("Could not save the session name.");
  }, []);

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

  const deleteThread = useCallback(
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

  useEffect(() => {
    if (!deleteNotice) return;
    const timeout = window.setTimeout(() => setDeleteNotice(null), 5_000);
    return () => window.clearTimeout(timeout);
  }, [deleteNotice]);

  useEffect(() => {
    if (loading || !user) return;
    const off = window.api.onPanelOpenThread((threadId) => {
      const selection = ++selectionRef.current;
      void invalidateThreads(queryClient);
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
  }, [loading, queryClient, user]);

  useEffect(() => {
    if (loading || !user) return;
    const off = window.api?.onPanelThreadUpdated?.((threadId) => {
      // This is an observation update, not a navigation command. If someone
      // opened the pill in the workspace and then selected another session,
      // refresh the cache without pulling them back to the old thread.
      void queryClient
        .fetchQuery(threadQueryOptions(threadId))
        .then((loaded) => {
          if (!loaded) return;
          queryClient.setQueryData(queryKeys.threads.detail(threadId), loaded);
          setThread((current) => (current?.id === threadId ? loaded : current));
          return invalidateThreads(queryClient);
        })
        .catch(() => {});
    });
    return () => off?.();
  }, [loading, queryClient, user]);

  useEffect(() => {
    if (latestQuery.isPending) return;
    setThread((current) => current ?? latestQuery.data ?? newThread());
  }, [latestQuery.data, latestQuery.isPending]);

  const value = useMemo(
    () => ({
      thread,
      switchThread,
      selectThread,
      startNewThread,
      isThreadLoading: loadingThreadId === thread?.id,
      threadLoadError,
      retryThreadLoad,
      localTitles,
      renameThread,
      deleteThread,
    }),
    [
      deleteThread,
      localTitles,
      renameThread,
      retryThreadLoad,
      selectThread,
      startNewThread,
      switchThread,
      thread,
      threadLoadError,
      loadingThreadId,
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
    </RemixSessionContext.Provider>
  );
}

export function useRemixSession(): RemixSessionContextValue {
  const context = useContext(RemixSessionContext);
  if (!context)
    throw new Error("useRemixSession must be used within RemixSessionProvider");
  return context;
}
