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
import { saveOnboarding } from "./onboarding-persistence";

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
 * Tracks whether this installation still needs the product-level welcome.
 * Existing people with Remix history are grandfathered, so moving this flow
 * out of Remix never interrupts established workspaces.
 */
export function useOnboarding(canRequestCloudData: boolean): {
  status: OnboardingStatus;
  markDone: () => Promise<boolean>;
  saving: boolean;
  error: string | null;
  loadError: boolean;
  retryLoad: () => void;
} {
  const [status, setStatus] = useState<OnboardingStatus>("loading");
  const [saved, setSaved] = useState<OnboardingSaved | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pendingSave = useRef<Promise<boolean> | null>(null);
  const queryClient = useQueryClient();
  const settingsQuery = useQuery(settingsQueryOptions());
  // Cloud history is only needed to grandfather installations with no saved
  // onboarding state. A completed or resumable local save must work offline.
  const needsCloudHistory =
    canRequestCloudData &&
    !settingsQuery.isPending &&
    !settingsQuery.isError &&
    !parseSaved(settingsQuery.data?.[ONBOARDING_KEY]);
  const threadsQuery = useInfiniteQuery({
    ...threadHistoryInfiniteQueryOptions(),
    enabled: needsCloudHistory,
  });
  const decided = useRef<OnboardingSaved | null>(null);

  useEffect(() => {
    if (
      settingsQuery.isPending ||
      (needsCloudHistory && threadsQuery.isPending)
    )
      return;

    const parsed = parseSaved(settingsQuery.data?.[ONBOARDING_KEY]);
    if (settingsQuery.isError) {
      setStatus(parsed?.done ? "done" : "show");
      return;
    }
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
    if (
      canRequestCloudData &&
      (threadsQuery.data?.pages[0]?.threads.length ?? 0) > 0
    ) {
      const grandfathered: OnboardingSaved = { v: 2, done: true };
      decided.current = grandfathered;
      // Migration must not interrupt an established workspace. A failed write
      // is retried on the next launch; explicit user completion below is strict.
      void saveOnboarding(grandfathered).catch(() => {});
      cacheSaved(queryClient, grandfathered);
      setSaved(grandfathered);
      setStatus("done");
      return;
    }
    setStatus("show");
  }, [
    canRequestCloudData,
    needsCloudHistory,
    queryClient,
    settingsQuery.data,
    settingsQuery.isPending,
    settingsQuery.isError,
    threadsQuery.data,
    threadsQuery.isPending,
  ]);

  const savedRef = useRef<OnboardingSaved | null>(null);
  savedRef.current = saved;

  const markDone = useCallback((): Promise<boolean> => {
    if (pendingSave.current) return pendingSave.current;
    if (!settingsQuery.data || settingsQuery.isError)
      return Promise.resolve(false);
    const previous = savedRef.current;
    const next: OnboardingSaved = {
      ...previous,
      v: 2,
      done: true,
    };
    setSaving(true);
    setError(null);
    pendingSave.current = saveOnboarding(next)
      .then(() => {
        decided.current = next;
        cacheSaved(queryClient, next);
        setSaved(next);
        setStatus("done");
        return true;
      })
      .catch(() => {
        setError(
          "Couldn’t save your setup. Your choices are still here. Try again.",
        );
        return false;
      })
      .finally(() => {
        pendingSave.current = null;
        setSaving(false);
      });
    return pendingSave.current;
  }, [queryClient, settingsQuery.data, settingsQuery.isError]);

  return {
    status:
      needsCloudHistory &&
      threadsQuery.isPending &&
      !parseSaved(settingsQuery.data?.[ONBOARDING_KEY])?.done
        ? "loading"
        : status,
    markDone,
    saving,
    error,
    loadError: settingsQuery.isError,
    retryLoad: () => {
      void settingsQuery.refetch();
    },
  };
}
