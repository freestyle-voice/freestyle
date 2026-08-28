import {
  invalidateThreads,
  latestThreadQueryOptions,
  queryKeys,
} from "@renderer/lib/query";
import {
  deleteThread as deleteStoredThread,
  getThread,
  type ThreadState,
} from "@renderer/lib/threads";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
  const queryClient = useQueryClient();
  const latestQuery = useQuery(latestThreadQueryOptions());
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
    // Development can briefly run a renderer compiled against a newer preload.
    // Keep the workspace usable until Electron reloads its preload bridge.
    void window.api
      ?.getRemixSessionTitles?.()
      .then((titles) => setLocalTitles(titles))
      .catch(() => {});
  }, []);

  const renameThread = useCallback(async (threadId: string, title: string) => {
    const nextTitle = title.trim();
    if (!nextTitle) return;
    setLocalTitles((titles) => ({ ...titles, [threadId]: nextTitle }));
    const saved = await window.api?.setRemixSessionTitle?.(threadId, nextTitle);
    if (!saved) throw new Error("Could not save the session name.");
  }, []);

  const deleteThread = useCallback(
    async (threadId: string) => {
      await deleteStoredThread(threadId);
      setLocalTitles((titles) => {
        const next = { ...titles };
        delete next[threadId];
        return next;
      });
      void window.api?.setRemixSessionTitle?.(threadId, null);
      await invalidateThreads(queryClient);
      if (thread?.id === threadId) switchThread(newThread());
    },
    [queryClient, switchThread, thread?.id],
  );

  useEffect(() => {
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
  }, [queryClient]);

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
    </RemixSessionContext.Provider>
  );
}

export function useRemixSession(): RemixSessionContextValue {
  const context = useContext(RemixSessionContext);
  if (!context)
    throw new Error("useRemixSession must be used within RemixSessionProvider");
  return context;
}
