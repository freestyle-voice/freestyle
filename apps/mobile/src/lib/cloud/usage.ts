/**
 * Freestyle Cloud usage balance (credits). Same `/v1/usage` endpoint the
 * desktop reads, authenticated with the stored session cookie.
 */

import { cloudUrl } from "./config";
import { authHeaders, CloudAuthError } from "./session";

export interface CloudUsageBalance {
  remaining: number;
  limit: number;
  totalConsumed: number;
  windowStart: string;
  resetsAt: string;
}

export async function fetchCloudUsage(): Promise<CloudUsageBalance> {
  const headers = authHeaders();
  if (!headers) throw new CloudAuthError();

  const res = await fetch(`${cloudUrl()}/v1/usage`, {
    method: "GET",
    headers,
    credentials: "omit",
    signal: AbortSignal.timeout(10_000),
  });
  if (res.status === 401) throw new CloudAuthError();
  if (!res.ok) throw new Error(`Failed to load usage (${res.status})`);
  return (await res.json()) as CloudUsageBalance;
}
