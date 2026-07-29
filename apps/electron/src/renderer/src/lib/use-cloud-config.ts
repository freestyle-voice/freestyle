import type {
  IndustryToneDefaults,
  SuggestedLanguage,
} from "@freestyle-voice/validations";
import { orderBySuggestedLanguages as orderLanguages } from "@freestyle-voice/validations";
import { useQuery } from "@tanstack/react-query";
import { getClient } from "./api";
import { ONE_HOUR } from "./query";

interface CloudConfig {
  suggestedLanguages: SuggestedLanguage[];
  industryVocabulary: string[];
  industryToneDefaults: IndustryToneDefaults | null;
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
 * Order desktop language options (`{ value }`-shaped) by the cloud's
 * region-based suggestions, keeping `"auto"` pinned first. Thin wrapper over the
 * shared {@link orderLanguages} helper so the ranking matches the mobile picker.
 */
export function orderBySuggestedLanguages<T extends { value: string }>(
  options: T[],
  suggested: SuggestedLanguage[] | undefined,
): T[] {
  return orderLanguages(options, suggested, (o) => o.value);
}
