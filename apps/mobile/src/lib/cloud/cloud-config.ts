/**
 * Public cloud config (`GET /v2/config`): region-based suggested languages and
 * optional industry-based vocabulary/tone defaults. Unauthenticated and
 * CDN-cacheable. Mobile ignores the `prompts` field (cleanup runs server-side
 * on the streaming DO); it uses `suggestedLanguages` to order the language
 * picker and the industry data to seed a new user's tones.
 */

import type {
  IndustryToneDefaults,
  SuggestedLanguage,
} from "@freestyle-voice/validations";
import { cloudUrl } from "./config";

export interface CloudConfig {
  suggestedLanguages: SuggestedLanguage[];
  industryVocabulary: string[];
  industryToneDefaults: IndustryToneDefaults | null;
}

/** Fetch the public cloud config. Pass `industry` for industry suggestions. */
export async function fetchCloudConfig(
  industry?: string | null,
): Promise<CloudConfig> {
  const url = new URL(`${cloudUrl()}/v2/config`);
  if (industry) url.searchParams.set("industry", industry);
  const res = await fetch(url.toString(), {
    method: "GET",
    credentials: "omit",
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Failed to load cloud config (${res.status})`);
  const body = (await res.json()) as {
    suggestedLanguages?: SuggestedLanguage[];
    industryVocabulary?: string[];
    industryToneDefaults?: IndustryToneDefaults | null;
  };
  return {
    suggestedLanguages: body.suggestedLanguages ?? [],
    industryVocabulary: body.industryVocabulary ?? [],
    industryToneDefaults: body.industryToneDefaults ?? null,
  };
}
