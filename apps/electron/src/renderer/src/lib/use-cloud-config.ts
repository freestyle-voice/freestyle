import type { SuggestedLanguage } from "@freestyle-voice/validations";
import { useQuery } from "@tanstack/react-query";
import { getClient } from "./api";
import { ONE_HOUR } from "./query";

interface CloudConfig {
  suggestedLanguages: SuggestedLanguage[];
  industryVocabulary: string[];
  industryToneDefaults: Record<string, string> | null;
}

/**
 * The public cloud config (via the local server passthrough): region-based
 * suggested languages and optional industry vocabulary/tone defaults. Cached
 * for ~6h to match the cloud's CDN TTL. Best-effort — the UI falls back to its
 * static ordering when this is unavailable.
 */
export function useCloudConfig(enabled: boolean, industry?: string) {
  return useQuery({
    queryKey: ["cloud-config", industry ?? ""] as const,
    enabled,
    staleTime: 6 * ONE_HOUR,
    retry: 1,
    queryFn: async (): Promise<CloudConfig> => {
      const res = await getClient().api.config.cloud.$get({
        query: industry ? { industry } : {},
      });
      if (!res.ok) throw new Error("Failed to load cloud config");
      return (await res.json()) as CloudConfig;
    },
  });
}

/**
 * Order a list of language options so the cloud-suggested languages (for the
 * user's region) come first, preserving each group's relative order. Falls back
 * to the input order when there are no suggestions. `auto` (or any pinned
 * leading option) is expected to already be first in `options` and is left in
 * place.
 */
export function orderBySuggestedLanguages<T extends { value: string }>(
  options: T[],
  suggested: SuggestedLanguage[] | undefined,
  pinnedFirst: string[] = ["auto"],
): T[] {
  if (!suggested?.length) return options;

  const suggestedRank = new Map<string, number>();
  suggested.forEach((l, i) => {
    suggestedRank.set(l.code, i);
  });

  const pinned = options.filter((o) => pinnedFirst.includes(o.value));
  const rest = options.filter((o) => !pinnedFirst.includes(o.value));

  const withRank = rest.map((o, i) => ({ o, i }));
  withRank.sort((a, b) => {
    const ra = suggestedRank.get(a.o.value);
    const rb = suggestedRank.get(b.o.value);
    if (ra !== undefined && rb !== undefined) return ra - rb;
    if (ra !== undefined) return -1;
    if (rb !== undefined) return 1;
    return a.i - b.i; // stable: keep original order for non-suggested
  });

  return [...pinned, ...withRank.map((x) => x.o)];
}
