import type { QueryClient } from "@tanstack/react-query";
import { getApiBase, resolveApiBase } from "./api";
import { queryKeys } from "./query";

type SyncEvent = { resource: string; entityId?: string };

const resourceKeys: Record<string, readonly unknown[]> = {
  "brain-list": queryKeys.brain.all,
  "brain-file": queryKeys.brain.all,
  "thread-summary": queryKeys.threads.all,
  "thread-snapshot": queryKeys.threads.all,
  schedules: queryKeys.scheduled.tasks,
  connectors: queryKeys.connectors.all,
  usage: queryKeys.cloud.usage,
  attention: queryKeys.attention,
  suggestions: queryKeys.openers,
  config: queryKeys.cloud.config,
  pricing: queryKeys.cloud.pricing,
  profile: queryKeys.cloud.orgs,
};

/** Opens the local-only stream that makes background cache refreshes visible. */
export function startSyncInvalidation(queryClient: QueryClient): () => void {
  let source: EventSource | null = null;
  let closed = false;
  void resolveApiBase().then(() => {
    if (closed || !getApiBase().startsWith("http://127.0.0.1")) return;
    source = new EventSource(`${getApiBase()}/api/sync/events`);
    source.addEventListener("sync", (message) => {
      try {
        const event = JSON.parse(
          (message as MessageEvent<string>).data,
        ) as SyncEvent;
        const queryKey = resourceKeys[event.resource];
        if (queryKey) void queryClient.invalidateQueries({ queryKey });
      } catch {
        // A malformed local event must never break the renderer's query cache.
      }
    });
  });
  return () => {
    closed = true;
    source?.close();
  };
}
