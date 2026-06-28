import type { AppType } from "@freestyle-voice/server";
import { hc } from "hono/client";

const DEFAULT_PORT = 4649;
const HEALTH_TIMEOUT_MS = 3000;
let resolvedPort: number = DEFAULT_PORT;
let initialized = false;

/** Base URL of the locally-run Freestyle server. */
export function getApiBase(): string {
  return `http://127.0.0.1:${resolvedPort}`;
}

export async function initApiBase(): Promise<void> {
  if (initialized) return;
  await refreshApiBase();
  initialized = true;
}

/**
 * Verify a Freestyle server is reachable and identifies itself at `base`.
 * `/api/health` is unauthenticated, so this checks reachability only.
 */
export async function checkServerHealth(
  base: string,
  timeoutMs = HEALTH_TIMEOUT_MS,
): Promise<boolean> {
  try {
    const res = await hc<AppType>(base).api.health.$get(
      {},
      { init: { signal: AbortSignal.timeout(timeoutMs) } },
    );
    if (!res.ok) return false;
    const data = await res.json();
    return data.status === "ok" && data.name === "freestyle";
  } catch {
    return false;
  }
}

/** Re-read the local server port and verify it's reachable. */
export async function refreshApiBase(): Promise<boolean> {
  try {
    resolvedPort = await window.api.getServerPort();
  } catch {
    resolvedPort = DEFAULT_PORT;
  }
  return checkServerHealth(getApiBase());
}

export function getClient() {
  return hc<AppType>(getApiBase());
}
