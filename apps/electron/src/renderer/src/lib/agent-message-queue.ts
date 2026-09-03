import { apiFetch } from "@renderer/lib/api";
import { useCallback, useEffect, useRef, useState } from "react";

export type QueuedAgentMessage = {
  id: string;
  text: string;
  createdAt: number;
};

export type AgentMessageQueueSnapshot = {
  items: QueuedAgentMessage[];
  active: boolean;
};

export type AgentThreadActivity = {
  threadId: string;
  /** There is an upstream agent stream currently producing this turn. */
  active: boolean;
  /** Follow-ups accepted by the local Hono queue but not yet dispatched. */
  queuedCount: number;
};

const EMPTY_QUEUE: AgentMessageQueueSnapshot = { items: [], active: false };

type AgentActivityUpdate = {
  threads: AgentThreadActivity[];
  /** The affected thread, or null when the whole local owner was reset. */
  changedThreadId: string | null;
};

type AgentActivityListener = (update: AgentActivityUpdate) => void;

const activityListeners = new Set<AgentActivityListener>();
let activitySnapshot: AgentActivityUpdate = {
  threads: [],
  changedThreadId: null,
};
let activityStreamAbort: AbortController | null = null;
let activityReconnectTimer: number | null = null;
let activityReconnectAttempt = 0;

function parseActivityPayload(payload: unknown): AgentActivityUpdate {
  if (!payload || typeof payload !== "object")
    return { threads: [], changedThreadId: null };
  const { threads, changedThreadId } = payload as {
    threads?: unknown;
    changedThreadId?: unknown;
  };
  if (!Array.isArray(threads)) return { threads: [], changedThreadId: null };
  return {
    threads: threads.flatMap((entry) => {
      if (!entry || typeof entry !== "object") return [];
      const item = entry as Partial<AgentThreadActivity>;
      if (typeof item.threadId !== "string" || !item.threadId) return [];
      return [
        {
          threadId: item.threadId,
          active: item.active === true,
          queuedCount:
            typeof item.queuedCount === "number" && item.queuedCount > 0
              ? item.queuedCount
              : 0,
        },
      ];
    }),
    changedThreadId:
      typeof changedThreadId === "string" && changedThreadId
        ? changedThreadId
        : null,
  };
}

function publishActivitySnapshot(next: AgentActivityUpdate): void {
  activitySnapshot = next;
  for (const listener of activityListeners) listener(next);
}

function consumeActivityEvent(frame: string): void {
  const lines = frame.split(/\r?\n/);
  const event = lines
    .find((line) => line.startsWith("event:"))
    ?.slice("event:".length)
    .trim();
  if (event !== "activity") return;
  const data = lines
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice("data:".length).trimStart())
    .join("\n");
  try {
    publishActivitySnapshot(parseActivityPayload(JSON.parse(data)));
  } catch {
    // A malformed event must not tear down a healthy long-lived connection.
  }
}

async function readActivityStream(response: Response): Promise<void> {
  if (!response.ok || !response.body)
    throw new Error("agent_activity_stream_unavailable");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      pending += decoder.decode(value, { stream: true });
      const frames = pending.split(/\r?\n\r?\n/);
      pending = frames.pop() ?? "";
      for (const frame of frames) consumeActivityEvent(frame);
    }
  } finally {
    void reader.cancel().catch(() => {});
  }
}

function scheduleActivityReconnect(): void {
  if (activityReconnectTimer !== null || activityListeners.size === 0) return;
  const delay = Math.min(1_000 * 2 ** activityReconnectAttempt, 15_000);
  activityReconnectAttempt += 1;
  activityReconnectTimer = window.setTimeout(() => {
    activityReconnectTimer = null;
    connectActivityStream();
  }, delay);
}

function connectActivityStream(): void {
  if (activityStreamAbort || activityReconnectTimer !== null) return;
  if (activityListeners.size === 0) return;
  const controller = new AbortController();
  activityStreamAbort = controller;
  void apiFetch("/api/agent/activity/stream", {
    headers: { Accept: "text/event-stream" },
    signal: controller.signal,
  })
    .then(readActivityStream)
    .catch(() => {
      // Keep the last known snapshot if the local server restarts. A reconnect
      // is deliberately backoff-based, never an activity polling loop.
    })
    .finally(() => {
      if (activityStreamAbort === controller) activityStreamAbort = null;
      if (!controller.signal.aborted) scheduleActivityReconnect();
    });
}

/**
 * Subscribe to the single local Hono activity stream. All Remix UI surfaces
 * share this connection, which is authenticated through apiFetch and carries
 * only active/queued metadata.
 */
export function subscribeToAgentThreadActivity(
  listener: AgentActivityListener,
): () => void {
  activityListeners.add(listener);
  listener(activitySnapshot);
  connectActivityStream();
  return () => {
    activityListeners.delete(listener);
    if (activityListeners.size !== 0) return;
    if (activityReconnectTimer !== null) {
      window.clearTimeout(activityReconnectTimer);
      activityReconnectTimer = null;
    }
    activityStreamAbort?.abort();
    activityStreamAbort = null;
  };
}

async function readQueue(
  response: Response,
): Promise<AgentMessageQueueSnapshot> {
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(payload?.error ?? "queue_request_failed");
  }
  const payload = (await response.json()) as Partial<AgentMessageQueueSnapshot>;
  return {
    active: payload.active === true,
    items: Array.isArray(payload.items) ? payload.items : [],
  };
}

function queuePath(threadId: string): string {
  return `/api/agent/${encodeURIComponent(threadId)}/queue`;
}

export async function getAgentMessageQueue(
  threadId: string,
): Promise<AgentMessageQueueSnapshot> {
  return readQueue(await apiFetch(queuePath(threadId)));
}

/** One local request for all in-flight Remix sessions. This deliberately
 * reports only activity metadata: stream state and queue depth, never user
 * input or agent output. */
export async function getAgentThreadActivity(): Promise<AgentThreadActivity[]> {
  const response = await apiFetch("/api/agent/activity");
  if (!response.ok) throw new Error("agent_activity_request_failed");
  return parseActivityPayload(await response.json()).threads;
}

/**
 * Observe the local Hono queue without making the pill depend on React Query.
 * The local server is authoritative, so a pill/workspace handoff naturally
 * sees the same list and active-stream state through the shared activity
 * stream.
 */
export function useAgentMessageQueue(threadId: string) {
  const [snapshot, setSnapshot] =
    useState<AgentMessageQueueSnapshot>(EMPTY_QUEUE);
  const aliveRef = useRef(true);
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;

  const refresh = useCallback(async () => {
    try {
      const next = await getAgentMessageQueue(threadId);
      if (aliveRef.current) setSnapshot(next);
      return next;
    } catch {
      // A local-server restart or an old external server simply has no queue.
      // Preserve any visible entry until the next successful observation.
      return null;
    }
  }, [threadId]);

  useEffect(() => {
    aliveRef.current = true;
    setSnapshot(EMPTY_QUEUE);
    void refresh();
    return () => {
      aliveRef.current = false;
    };
  }, [refresh]);

  useEffect(
    () =>
      subscribeToAgentThreadActivity((threads) => {
        const activity = threads.threads.find(
          (entry) => entry.threadId === threadId,
        );
        const current = snapshotRef.current;

        // Queue text is intentionally not placed on the shared event stream.
        // Refresh this thread only when it was involved in the event (or was
        // active immediately before it completed), so both pill and workspace
        // see edits without introducing a polling loop.
        if (
          threads.changedThreadId === threadId ||
          (threads.changedThreadId === null &&
            (activity || current.active || current.items.length > 0))
        ) {
          void refresh();
        }
      }),
    [refresh, threadId],
  );

  const enqueue = useCallback(
    async (text: string, context?: unknown) => {
      const response = await apiFetch(queuePath(threadId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          ...(context === undefined ? {} : { context }),
        }),
      });
      const next = await readQueue(response);
      if (aliveRef.current) setSnapshot(next);
      return next;
    },
    [threadId],
  );

  const update = useCallback(
    async (id: string, text: string) => {
      const response = await apiFetch(
        `${queuePath(threadId)}/${encodeURIComponent(id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        },
      );
      const next = await readQueue(response);
      if (aliveRef.current) setSnapshot(next);
      return next;
    },
    [threadId],
  );

  const remove = useCallback(
    async (id: string) => {
      const response = await apiFetch(
        `${queuePath(threadId)}/${encodeURIComponent(id)}`,
        {
          method: "DELETE",
        },
      );
      const next = await readQueue(response);
      if (aliveRef.current) setSnapshot(next);
      return next;
    },
    [threadId],
  );

  const steer = useCallback(
    async (id: string) => {
      const response = await apiFetch(
        `${queuePath(threadId)}/${encodeURIComponent(id)}/steer`,
        { method: "POST" },
      );
      const next = await readQueue(response);
      if (aliveRef.current) setSnapshot(next);
      return next;
    },
    [threadId],
  );

  return { ...snapshot, refresh, enqueue, update, remove, steer };
}
