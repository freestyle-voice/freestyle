import { createAppLogger } from "@freestyle-voice/utils";
import { Hono } from "hono";
import { trustedDesktopAgentFields } from "../lib/agent-request.js";
import { agentStreamStore } from "../lib/agent-stream-store.js";
import { freestyleCloudUrl } from "../lib/freestyle-cloud.js";
import { getSessionToken, invalidateSession } from "../lib/sessions.js";

const log = createAppLogger("agent-threads");

async function forward(
  path: string,
  init: RequestInit = {},
): Promise<{ status: number; payload: unknown }> {
  const token = getSessionToken();
  if (!token)
    return {
      status: 401,
      payload: { ok: false, reason: "cloud_auth_required" },
    };
  try {
    const upstream = await fetch(`${freestyleCloudUrl()}/v2/threads${path}`, {
      ...init,
      headers: {
        ...(init.headers ?? {}),
        Authorization: `Bearer ${token}`,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (upstream.status === 401) {
      invalidateSession();
      return {
        status: 401,
        payload: { ok: false, reason: "cloud_auth_required" },
      };
    }
    return { status: upstream.status, payload: await upstream.json() };
  } catch (err) {
    log.debug(`Thread request ${path} failed: ${err}`);
    return { status: 502, payload: { ok: false, reason: "cloud-unreachable" } };
  }
}

/**
 * Snapshot observation is intentionally a pass-through stream. Unlike a turn
 * submission, closing this request only detaches one renderer observer; the
 * Cloud harness continues the already-accepted turn independently.
 */
async function forwardStream(
  path: string,
  signal: AbortSignal,
): Promise<Response> {
  const token = getSessionToken();
  if (!token)
    return new Response(
      JSON.stringify({ ok: false, reason: "cloud_auth_required" }),
      {
        status: 401,
        headers: { "Content-Type": "application/json" },
      },
    );
  try {
    const upstream = await fetch(`${freestyleCloudUrl()}/v2/threads${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal,
    });
    if (upstream.status === 401) invalidateSession();
    return upstream;
  } catch (err) {
    log.debug(`Thread stream ${path} failed: ${err}`);
    return new Response(
      JSON.stringify({ ok: false, reason: "cloud-unreachable" }),
      {
        status: 502,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}

async function trustedTurnBody(request: Request): Promise<string | null> {
  const incoming = await request.json().catch(() => null);
  if (!incoming || typeof incoming !== "object" || Array.isArray(incoming))
    return null;
  // The local server, rather than the renderer, declares local capabilities
  // and MCP schemas. Context and ordinary turn fields still pass through.
  const {
    client: _client,
    mcpTools: _mcpTools,
    ...turn
  } = incoming as Record<string, unknown>;
  return JSON.stringify({ ...turn, ...trustedDesktopAgentFields() });
}

const agentThreadsRoute = new Hono()
  .post("/clear", async (c) => {
    const { status, payload } = await forward("/clear", { method: "POST" });
    return c.json(payload as object, status as 200);
  })
  .get("/list", async (c) => {
    const params = new URLSearchParams();
    const origin = c.req.query("origin");
    if (origin === "user" || origin === "scheduled")
      params.set("origin", origin);
    for (const key of ["limit", "cursor"] as const) {
      const value = Number(c.req.query(key));
      if (Number.isInteger(value) && value > 0) params.set(key, String(value));
    }
    const query = params.size > 0 ? `?${params.toString()}` : "";
    const { status, payload } = await forward(query);
    return c.json(payload as object, status as 200);
  })
  .get("/latest", async (c) => {
    const { status, payload } = await forward("/latest");
    return c.json(payload as object, status as 200);
  })
  // A turn is accepted by the Cloud harness before this response returns. The
  // renderer can disappear or switch surfaces after the receipt without
  // aborting the agent's work.
  .post("/:id/turns", async (c) => {
    const body = await trustedTurnBody(c.req.raw);
    if (!body) return c.json({ ok: false, reason: "invalid-turn" }, 400);
    const { status, payload } = await forward(
      `/${encodeURIComponent(c.req.param("id"))}/turns`,
      { method: "POST", body },
    );
    return c.json(payload as object, status as 200);
  })
  .get("/:id/stream", async (c) => {
    const upstream = await forwardStream(
      `/${encodeURIComponent(c.req.param("id"))}/stream`,
      c.req.raw.signal,
    );
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "Content-Type":
          upstream.headers.get("Content-Type") ?? "application/json",
        ...(upstream.ok ? { "Cache-Control": "no-cache, no-transform" } : {}),
      },
    });
  })
  .get("/:id", async (c) => {
    const id = c.req.param("id");
    const activeMessages = agentStreamStore.getActiveMessages(id);
    const { status, payload } = await forward(`/${encodeURIComponent(id)}`);
    // Cloud writes the full transcript once its UI-message stream completes.
    // During a live pill-to-workspace handoff, retain the submitted message
    // base locally so `useChat` can reconnect to the active assistant stream.
    if (activeMessages) {
      const envelope =
        payload && typeof payload === "object" && !Array.isArray(payload)
          ? (payload as Record<string, unknown>)
          : {};
      const remoteThread =
        envelope.thread &&
        typeof envelope.thread === "object" &&
        !Array.isArray(envelope.thread)
          ? (envelope.thread as Record<string, unknown>)
          : {};
      return c.json({
        ...envelope,
        thread: { ...remoteThread, id, messages: activeMessages },
      });
    }
    return c.json(payload as object, status as 200);
  })
  .delete("/:id", async (c) => {
    const { status, payload } = await forward(
      `/${encodeURIComponent(c.req.param("id"))}`,
      { method: "DELETE" },
    );
    return c.json(payload as object, status as 200);
  });

export default agentThreadsRoute;
