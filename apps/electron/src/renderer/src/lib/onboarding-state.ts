import type { OnboardingSaved } from "@renderer/lib/onboarding-core";
import { ONBOARDING_KEY, parseSaved } from "@renderer/lib/onboarding-core";
import {
  queryKeys,
  settingsQueryOptions,
  threadHistoryInfiniteQueryOptions,
} from "@renderer/lib/query";
import {
  type QueryClient,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "./api";

function persistSaved(state: OnboardingSaved): void {
  void apiFetch(`/api/settings/${ONBOARDING_KEY}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ value: JSON.stringify(state) }),
  }).catch(() => {});
}

function cacheSaved(queryClient: QueryClient, state: OnboardingSaved): void {
  queryClient.setQueryData<Record<string, string>>(
    queryKeys.settings,
    (previous) => ({
      ...(previous ?? {}),
      [ONBOARDING_KEY]: JSON.stringify(state),
    }),
  );
}

export type OnboardingStatus = "loading" | "show" | "done";

/**
 * Tracks whether a signed-in person still needs the product-level welcome.
 * Existing people with Remix history are grandfathered, so moving this flow
 * out of Remix never interrupts established workspaces.
 */
export function useOnboarding(enabled: boolean): {
  status: OnboardingStatus;
  markDone: () => void;
} {
  const [status, setStatus] = useState<OnboardingStatus>("loading");
  const [saved, setSaved] = useState<OnboardingSaved | null>(null);
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({ ...settingsQueryOptions(), enabled });
  const threadsQuery = useInfiniteQuery({
    ...threadHistoryInfiniteQueryOptions(),
    enabled,
  });
  const decided = useRef<OnboardingSaved | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (settingsQuery.isPending || threadsQuery.isPending) return;

    const parsed = parseSaved(settingsQuery.data?.[ONBOARDING_KEY]);
    if (decided.current?.done && !parsed?.done) {
      cacheSaved(queryClient, decided.current);
      return;
    }
    setSaved(parsed);

    if (parsed?.done) {
      setStatus("done");
      return;
    }
    if (parsed) {
      setStatus("show");
      return;
    }
    if ((threadsQuery.data?.pages[0]?.threads.length ?? 0) > 0) {
      const grandfathered: OnboardingSaved = { v: 2, done: true };
      decided.current = grandfathered;
      persistSaved(grandfathered);
      cacheSaved(queryClient, grandfathered);
      setSaved(grandfathered);
      setStatus("done");
      return;
    }
    setStatus("show");
  }, [
    enabled,
    queryClient,
    settingsQuery.data,
    settingsQuery.isPending,
    threadsQuery.data,
    threadsQuery.isPending,
  ]);

  const savedRef = useRef<OnboardingSaved | null>(null);
  savedRef.current = saved;

  const markDone = useCallback((): void => {
    const previous = savedRef.current;
    const next: OnboardingSaved = {
      v: 2,
      done: true,
      ...(previous?.replayed ? { replayed: true } : {}),
    };
    decided.current = next;
    persistSaved(next);
    cacheSaved(queryClient, next);
    setSaved(next);
    setStatus("done");
  }, [queryClient]);

  return { status, markDone };
}
