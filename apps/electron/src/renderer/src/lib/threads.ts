import { apiFetch } from "@renderer/lib/api";
import type { UIMessage } from "ai";

/** The canonical title is generated and persisted by the Remix agent. */
export type ThreadState = {
  id: string;
  title?: string | null;
  messages: UIMessage[];
};

/**
 * Keep workspace chrome aligned with the server-owned conversation title. A
 * new thread stays neutral while the agent is naming it rather than echoing
 * the user's first message into the title bar.
 */
export function displayThreadTitle(thread: Pick<ThreadState, "title">): string {
  return thread.title?.trim() || "New chat";
}

export type DurableThreadAction = {
  id: string;
  turnId: string;
  kind: "connector" | "desktop";
  status:
    | "pending"
    | "claimed"
    | "completed"
    | "declined"
    | "expired"
    | "failed";
  toolName: string;
  display: string;
  capability: string | null;
  expiresAt: string;
};

export type DurableThreadRuntime = {
  thread: ThreadState;
  activeTurn: { id: string; status: string; error: string | null } | null;
  pendingAction: DurableThreadAction | null;
};

/** Redacted lifecycle events are independent of transient streamed messages. */
export type DurableTurnEvent = {
  id: string;
  turnId: string;
  threadId: string;
  eventType: "turn" | "action";
  status: string;
  summary: string | null;
  createdAt: string;
};

/** A recoverable, redacted record of a completed or active Remix turn. */
export type DurableThreadRun = {
  id: string;
  threadId: string;
  clientRequestId: string;
  firstTurn: boolean;
  status: string;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export type ThreadOrigin = "user" | "scheduled";

export const THREAD_ORIGINS: ThreadOrigin[] = ["user", "scheduled"];

export const THREAD_ORIGIN_LABELS: Record<ThreadOrigin, string> = {
  user: "Conversations",
  scheduled: "Briefs",
};

export type ThreadSummary = {
  id: string;
  title: string;
  updatedAt: number;
  origin?: ThreadOrigin;
};

export type ThreadPage = {
  threads: ThreadSummary[];
  nextCursor: number | null;
};

async function responseJson<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error("Could not load conversations.");
  return (await response.json()) as T;
}

export async function listThreads({
  cursor,
  limit = 24,
  origin,
}: {
  cursor?: number;
  limit?: number;
  origin?: ThreadOrigin;
} = {}): Promise<ThreadPage> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor !== undefined) params.set("cursor", String(cursor));
  if (origin) params.set("origin", origin);
  return responseJson<ThreadPage>(
    await apiFetch(`/api/agent/thread/list?${params.toString()}`),
  );
}

export async function getLatestThread(): Promise<ThreadState | null> {
  const data = await responseJson<{ thread: ThreadState | null }>(
    await apiFetch("/api/agent/thread/latest"),
  );
  return data.thread;
}

export async function getThread(id: string): Promise<ThreadState | null> {
  const data = await responseJson<{ thread: ThreadState | null }>(
    await apiFetch(`/api/agent/thread/${encodeURIComponent(id)}`),
  );
  return data.thread;
}

/** Remove a single server-owned thread. Display-name overrides live locally
 * in Electron and are cleaned up by the Remix session provider afterwards. */
export async function deleteThread(id: string): Promise<void> {
  await responseJson<{ ok: true }>(
    await apiFetch(`/api/agent/thread/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
  );
}

/** The ordinary thread remains D1 history; this optional envelope adds only
 * durable execution state and never contains server-side tool inputs. */
export async function getThreadRuntime(
  id: string,
): Promise<DurableThreadRuntime | null> {
  const data = await responseJson<DurableThreadRuntime>(
    await apiFetch(`/api/agent/thread/${encodeURIComponent(id)}`),
  );
  return data.thread ? data : null;
}

export async function getDurableTurnEvents(
  turnId: string,
): Promise<DurableTurnEvent[]> {
  const response = await apiFetch(
    `/api/agent/turn/${encodeURIComponent(turnId)}/events`,
  );
  // The timeline endpoint is additive. During a rolling Cloud deploy, the
  // existing thread/approval experience remains usable instead of surfacing a
  // noisy error for an older Worker isolate.
  if (response.status === 404) return [];
  const data = await responseJson<{ events: DurableTurnEvent[] }>(response);
  return data.events;
}

export async function getDurableThreadRuns(
  threadId: string,
): Promise<DurableThreadRun[]> {
  const response = await apiFetch(
    `/api/agent/thread/${encodeURIComponent(threadId)}/runs`,
  );
  // This is an additive Cloud endpoint. A Desktop release can still show its
  // ordinary chat while a rolling deployment has not exposed run history yet.
  if (response.status === 404) return [];
  const data = await responseJson<{ runs: DurableThreadRun[] }>(response);
  return data.runs;
}

export async function sendDurableTurnCommand(
  turnId: string,
  command: Record<string, unknown>,
): Promise<unknown> {
  return responseJson<unknown>(
    await apiFetch(`/api/agent/turn/${encodeURIComponent(turnId)}/commands`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(command),
    }),
  );
}

/** Explicitly end a server-owned turn; unlike aborting a stream, this survives
 * an app close and prevents the harness from continuing in the background. */
export async function cancelDurableTurn(turnId: string): Promise<unknown> {
  return sendDurableTurnCommand(turnId, { type: "cancel" });
}
