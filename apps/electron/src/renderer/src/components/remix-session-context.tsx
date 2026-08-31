import { useCloudAuth } from "@renderer/lib/auth-context";
import {
  invalidateThreads,
  latestThreadQueryOptions,
  optimisticallyDeleteThread,
  queryKeys,
  restoreOptimisticallyDeletedThread,
} from "@renderer/lib/query";
import {
  deleteThread as deleteStoredThread,
  getThread,
  type ThreadState,
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
  startNewThread: () => void;
  localTitles: Record<string, string>;
  renameThread: (threadId: string, title: string) => Promise<void>;
  deleteThread: (threadId: string) => Promise<void>;
};

type ThreadDeletionVariables = {
  threadId: string;
  snapshot: ReturnType<typeof optimisticallyDeleteThread>;
  selected: ThreadState | null;
  replacementSelection: number | null;
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
  const [localTitles, setLocalTitles] = useState<Record<string, string>>({});
  const [deleteNotice, setDeleteNotice] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { user, loading } = useCloudAuth();
  const latestQuery = useQuery({
    ...latestThreadQueryOptions(),
    enabled: !loading && !!user,
  });
  const selectionRef = useRef(0);

  const switchThread = useCallback((next: ThreadState) => {
    selectionRef.current += 1;
    setThread(next);
  }, []);

  const startNewThread = useCallback(
    () => switchThread(newThread()),
    [switchThread],
  );

  useEffect(() => {
    if (loading || !user) {
      setThread(null);
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

  const deleteThreadMutation = useMutation({
    mutationFn: ({ threadId }: ThreadDeletionVariables) =>
      deleteStoredThread(threadId),
    onMutate: (variables: ThreadDeletionVariables) => {
      return variables;
    },
    onSuccess: (_result, { threadId }) => {
      void window.api?.setRemixSessionTitle?.(threadId, null);
    },
    onError: (_error, { threadId }, context) => {
      if (!context) return;
      restoreOptimisticallyDeletedThread(
        queryClient,
        threadId,
        context.snapshot,
      );
      setLocalTitles(context.snapshot.localTitles);
      if (
        context.selected &&
        context.replacementSelection === selectionRef.current
      ) {
        switchThread(context.selected);
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

      return deleteThreadMutation.mutateAsync({
        threadId,
        snapshot,
        selected,
        replacementSelection,
      });
    },
    [deleteThreadMutation, localTitles, queryClient, switchThread, thread],
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
          setThread(picked);
        });
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
      startNewThread,
      localTitles,
      renameThread,
      deleteThread,
    }),
    [
      deleteThread,
      localTitles,
      renameThread,
      startNewThread,
      switchThread,
      thread,
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
