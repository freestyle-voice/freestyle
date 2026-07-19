/**
 * Thin helpers over `window.freestyle.api` for the agent's own routes. Both the
 * pill panel and the settings page talk to the same `/agent/*` endpoints, so the
 * base path and JSON handling live here rather than being duplicated.
 */

/**
 * Derive this page's own plugin slug from its URL. The page is served at
 * `/api/plugins/<slug>/ui/...`, and the slug differs between a production
 * install (`freestyle-voice-plugin-agent`) and a dev link
 * (`freestyle-voice-plugin-agent-dev`) — so hardcoding it breaks dev. The
 * `pluginApiGuard` also confines a page to its own `<slug>` namespace, so
 * calling the wrong slug 404s (or is blocked). Read it from `location` instead.
 */
function ownSlug(): string {
  const m = location.pathname.match(/\/api\/plugins\/([^/]+)\/ui\//);
  return m?.[1] ?? "freestyle-voice-plugin-agent";
}

const BASE = `/api/plugins/${ownSlug()}/agent`;

/** The base API path — exported for constructing direct URLs (e.g. EventSource). */
export const agentApiBase = BASE;

interface BridgeResponse {
  ok: boolean;
  json: <T>() => T;
}

async function call(path: string, init?: RequestInit): Promise<BridgeResponse> {
  const res = await window.freestyle?.api(`${BASE}${path}`, init);
  if (!res) throw new Error("Freestyle bridge unavailable");
  return res as unknown as BridgeResponse;
}

export async function getJson<T>(path: string): Promise<T | null> {
  try {
    const res = await call(path);
    return res.ok ? res.json<T>() : null;
  } catch {
    return null;
  }
}

export async function putJson<T>(
  path: string,
  body: unknown,
): Promise<T | null> {
  try {
    const res = await call(path, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return res.ok ? res.json<T>() : null;
  } catch {
    return null;
  }
}

export async function postJson<T>(
  path: string,
  body?: unknown,
): Promise<T | null> {
  try {
    const res = await call(path, {
      method: "POST",
      ...(body !== undefined
        ? {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }
        : {}),
    });
    return res.ok ? res.json<T>() : null;
  } catch {
    return null;
  }
}

export async function del(path: string): Promise<void> {
  try {
    await call(path, { method: "DELETE" });
  } catch {
    // best-effort
  }
}
