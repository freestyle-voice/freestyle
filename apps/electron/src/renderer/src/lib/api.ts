import type { AppType } from "@freestyle/server";
import { hc } from "hono/client";

const DEFAULT_PORT = 4649;
let resolvedPort: number = DEFAULT_PORT;
let initialized = false;

export function getApiBase(): string {
  return `http://127.0.0.1:${resolvedPort}`;
}

export async function initApiBase(): Promise<void> {
  if (initialized) return;
  await refreshApiBase();
  initialized = true;
}

/** Re-read the server port and verify the API is reachable. */
export async function refreshApiBase(): Promise<boolean> {
  try {
    resolvedPort = await window.api.getServerPort();
  } catch {
    resolvedPort = DEFAULT_PORT;
  }
  try {
    const res = await getClient().api.health.$get(
      {},
      {
        init: {
          signal: AbortSignal.timeout(3000),
        },
      },
    );
    if (!res.ok) return false;
    const data = (await res.json()) as { status?: string; name?: string };
    return data.status === "ok" && data.name === "freestyle";
  } catch {
    return false;
  }
}

export function getClient() {
  return hc<AppType>(getApiBase());
}
