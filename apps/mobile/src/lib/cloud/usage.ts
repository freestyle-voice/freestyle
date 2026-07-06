/**
 * Freestyle Cloud usage balance (credits). Same `/v1/usage` endpoint the
 * desktop reads.
 */

import { cloudUrl } from "./config";
import { CloudAuthError } from "./session";

export interface CloudUsageBalance {
  remaining: number;
  limit: number;
  totalConsumed: number;
  windowStart: string;
  resetsAt: string;
}

export async function fetchCloudUsage(
  token: string,
): Promise<CloudUsageBalance> {
  const res = await fetch(`${cloudUrl()}/v1/usage`, {
    method: "GET",
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (res.status === 401) throw new CloudAuthError();
  if (!res.ok) throw new Error(`Failed to load usage (${res.status})`);
  return (await res.json()) as CloudUsageBalance;
}
