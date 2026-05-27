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
  try {
    resolvedPort = await window.api.getServerPort();
  } catch {
    resolvedPort = DEFAULT_PORT;
  }
  initialized = true;
}

export function getClient() {
  return hc<AppType>(getApiBase());
}
