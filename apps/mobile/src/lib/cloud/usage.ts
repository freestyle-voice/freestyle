/**
 * Freestyle Cloud usage balance (credits). Reads the `/usage` endpoint (same
 * path the desktop server uses), authenticated with the stored session cookie
 * via the shared cloud client.
 */

import { cloud } from "./client";

export interface CloudUsageBalance {
  remaining: number;
  limit: number;
  totalConsumed: number;
  windowStart: string;
  resetsAt: string;
  plan: "free" | "pro";
  unlimited: boolean;
}

export async function fetchCloudUsage(): Promise<CloudUsageBalance> {
  // Auth + 401 handling live in the shared client; usage keeps the 10s budget.
  return cloud.json<CloudUsageBalance>("/usage", {
    method: "GET",
    timeoutMs: 10_000,
  });
}
