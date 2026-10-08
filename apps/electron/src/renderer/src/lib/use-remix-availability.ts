import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { getClient } from "./api";
import { useCloudAuth } from "./auth-context";
import { queryKeys } from "./query";

export type RemixRuntime =
  | { kind: "managed" }
  | {
      kind: "local";
      model: { provider: string; model_id: string; model_name: string };
    };

/** Model selection controls new sessions; existing sessions keep their owner. */
export function remixAvailability(
  runtime: RemixRuntime | undefined,
  phase: "checking" | "authenticated" | "signed_out",
) {
  const local = runtime?.kind === "local";
  const canUseCloud = phase === "authenticated";
  return {
    historyType: local ? ("local" as const) : ("remote" as const),
    canChat: !!runtime && (local || canUseCloud),
    canUseCloud,
    checking: !runtime || (!local && phase === "checking"),
    canOpenThread: (type: "local" | "remote" = "remote") =>
      type === "local" || canUseCloud,
  };
}

export function useRemixAvailability() {
  const { phase, user } = useCloudAuth();
  const query = useQuery({
    queryKey: queryKeys.models.remixRuntime,
    queryFn: async (): Promise<RemixRuntime> => {
      const response = await getClient().api.remix.sessions.runtime.$get();
      if (!response.ok) throw new Error("Could not load the Remix model.");
      return response.json();
    },
  });
  const availability = useMemo(
    () => remixAvailability(query.data, phase),
    [query.data, phase],
  );
  return {
    ...availability,
    cloudAccountId: user?.id ?? null,
    checking: !query.isError && availability.checking,
    runtime: query.data,
    error: query.isError ? "Could not load the Remix model." : null,
    retry: query.refetch,
    // Local sessions are device-owned, independent of account transitions.
    sessionScope:
      query.data?.kind === "local"
        ? `local:${query.data.model.provider}:${query.data.model.model_id}`
        : user
          ? `remote:${user.id}`
          : null,
  };
}
