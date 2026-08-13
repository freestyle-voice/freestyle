/**
 * Public cloud config (`GET /v2/config`): region-based suggested languages.
 * Unauthenticated and CDN-cacheable. Mobile uses `suggestedLanguages` to order
 * the language picker. Industry defaults are now applied server-side at
 * profile-update time and are no longer returned by this endpoint.
 */

import type { SuggestedLanguage } from "@freestyle-voice/validations";
import { cloudUrl } from "./config";

export interface CloudConfig {
  suggestedLanguages: SuggestedLanguage[];
}

/** Fetch the public cloud config (region-based language suggestions). */
export async function fetchCloudConfig(): Promise<CloudConfig> {
  const url = `${cloudUrl()}/v2/config`;
  const res = await fetch(url, {
    method: "GET",
    credentials: "omit",
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Failed to load cloud config (${res.status})`);
  const body = (await res.json()) as {
    suggestedLanguages?: SuggestedLanguage[];
  };
  return {
    suggestedLanguages: body.suggestedLanguages ?? [],
  };
}
