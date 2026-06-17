import type { AppType } from "@freestyle/server";
import { hc } from "hono/client";

const DEFAULT_PORT = 4649;
const HEALTH_TIMEOUT_MS = 3000;
let resolvedPort: number = DEFAULT_PORT;
// Configured server URL ("" = use the local server).
let serverUrl = "";
let initialized = false;

/** Base URL of the locally-run server (used when no server URL is configured). */
export function getLocalApiBase(): string {
  return `http://127.0.0.1:${resolvedPort}`;
}

export function getApiBase(): string {
  return serverUrl || getLocalApiBase();
}

export async function initApiBase(): Promise<void> {
  if (initialized) return;
  await refreshApiBase();
  initialized = true;
}

/**
 * Verify a Freestyle server is reachable and identifies itself at `base`.
 * Used for both the live API base and ad-hoc connectivity tests (settings).
 */
export async function checkServerHealth(
  base: string,
  timeoutMs = HEALTH_TIMEOUT_MS,
): Promise<boolean> {
  try {
    const res = await fetch(`${base}/api/health`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { status?: string; name?: string };
    return data.status === "ok" && data.name === "freestyle";
  } catch {
    return false;
  }
}

/** Re-read the server location (configured URL or local port) and verify it's reachable. */
export async function refreshApiBase(): Promise<boolean> {
  try {
    // Main returns an already-validated, normalized value.
    serverUrl = await window.api.getServerUrl();
  } catch {
    serverUrl = "";
  }
  if (!serverUrl) {
    try {
      resolvedPort = await window.api.getServerPort();
    } catch {
      resolvedPort = DEFAULT_PORT;
    }
  }
  return checkServerHealth(getApiBase());
}

export function getClient() {
  return hc<AppType>(getApiBase());
}
