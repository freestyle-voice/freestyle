const DEFAULT_PORT = 4649;
let resolvedPort: number = DEFAULT_PORT;
let initialized = false;

export function getApiBase(): string {
  return `http://localhost:${resolvedPort}`;
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
