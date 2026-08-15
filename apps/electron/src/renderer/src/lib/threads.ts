import { apiFetch } from "@renderer/lib/api";
import type { UIMessage } from "ai";

export type ThreadState = { id: string; messages: UIMessage[] };

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
