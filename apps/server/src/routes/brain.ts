import { syncBackoffMs } from "@freestyle-voice/sync";
import { createAppLogger } from "@freestyle-voice/utils";
import { Hono } from "hono";
import { readThroughCloudCache } from "../lib/cloud-cache.js";
import { getDb } from "../lib/db.js";
import { freestyleCloudUrl } from "../lib/freestyle-cloud.js";
import { getSessionToken, invalidateSession } from "../lib/sessions.js";
import { emitSyncEvent } from "../lib/sync-events.js";
import { cachedSyncScope, resolveSyncScope } from "../lib/sync-scope.js";
import { LocalSyncStore } from "../lib/sync-store.js";

const log = createAppLogger("brain-proxy");
const BRAIN_REQUEST_TIMEOUT_MS = 15_000;
const BRAIN_LIST_TTL_MS = 5 * 60_000;
const BRAIN_BODY_TTL_MS = 24 * 60 * 60_000;
const BRAIN_DRAIN_INTERVAL_MS = 60_000;

type BrainWrite = { path: string; text: string; ifMatch?: number };
type BrainDelete = { path: string };
type CloudFailure = {
  ok: false;
  reason: string;
  current?: { content: string; version: number };
};

async function forward(
  segment: string,
  method: "GET" | "POST",
  body?: unknown,
): Promise<{ status: number; payload: Record<string, unknown> }> {
  const token = getSessionToken();
  if (!token) {
    return {
      status: 401,
      payload: { ok: false, reason: "cloud_auth_required" },
    };
  }
  try {
    const upstream = await fetch(`${freestyleCloudUrl()}/v2/brain/${segment}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(BRAIN_REQUEST_TIMEOUT_MS),
    });
    if (upstream.status === 401) {
      invalidateSession();
      return {
        status: 401,
        payload: { ok: false, reason: "cloud_auth_required" },
      };
    }
    return {
      status: upstream.status,
      payload: (await upstream.json()) as Record<string, unknown>,
    };
  } catch (error) {
    log.error(`Brain proxy ${segment} failed: ${error}`);
    return { status: 502, payload: { ok: false, reason: "cloud-unreachable" } };
  }
}

function scopeForCache(): Promise<string | null> {
  const cached = cachedSyncScope();
  return cached ? Promise.resolve(cached) : resolveSyncScope();
}

async function drainBrainOperations(scope: string): Promise<void> {
  const store = new LocalSyncStore(getDb());
  const operations = store
    .dueOperations(scope)
    .filter((operation) => operation.resource === "brain-file");
  await Promise.all(
    operations.map(async (operation) => {
      const body = operation.payload as { text?: unknown };
      const request =
        operation.kind === "write"
          ? {
              path: operation.entityId,
              text: typeof body.text === "string" ? body.text : "",
              ifMatch: operation.expectedRevision ?? undefined,
              clientOperationId: operation.operationId,
            }
          : {
              path: operation.entityId,
              clientOperationId: operation.operationId,
            };
      const { status, payload } = await forward(
        operation.kind === "write" ? "write" : "delete",
        "POST",
        request,
      );
      if (payload.ok === true) {
        store.completeOperation(operation.operationId);
        if (operation.kind === "write") {
          const cached = store.readCached(
            scope,
            "brain-file",
            operation.entityId,
          );
          if (cached) {
            store.writeCached({
              scope,
              resource: "brain-file",
              id: operation.entityId,
              value: cached.value,
              revision:
                typeof payload.version === "number"
                  ? payload.version
                  : cached.revision,
            });
          }
        }
        emitSyncEvent({ resource: "brain-file", entityId: operation.entityId });
        emitSyncEvent({ resource: "brain-list" });
        return;
      }
      const reason =
        typeof payload.reason === "string" ? payload.reason : `http-${status}`;
      if (reason === "conflict") {
        const current = (payload as unknown as CloudFailure).current;
        if (current) {
          store.writeCached({
            scope,
            resource: "brain-file",
            id: operation.entityId,
            value: {
              ok: true,
              text: current.content,
              version: current.version,
            },
            revision: current.version,
          });
        }
        store.failOperation(operation.operationId, "conflict");
        emitSyncEvent({ resource: "brain-file", entityId: operation.entityId });
        return;
      }
      if (status >= 400 && status < 500 && status !== 409) {
        store.failOperation(operation.operationId, reason);
        return;
      }
      store.deferOperation(
        operation.operationId,
        operation.attempts + 1,
        syncBackoffMs(operation.attempts + 1),
        reason,
      );
    }),
  );
}

let drainTimer: NodeJS.Timeout | null = null;

/** Retries due Brain operations after their backoff expires, even while idle. */
function startBrainSyncDrain(): void {
  if (drainTimer) return;
  const drain = async () => {
    const scope = await scopeForCache();
    if (scope) await drainBrainOperations(scope);
  };
  void drain();
  drainTimer = setInterval(() => void drain(), BRAIN_DRAIN_INTERVAL_MS);
  drainTimer.unref();
}

function stopBrainSyncDrain(): void {
  if (!drainTimer) return;
  clearInterval(drainTimer);
  drainTimer = null;
}

async function cachedRead(
  scope: string | null,
  resource: string,
  id: string,
  ttl: number,
  segment: string,
  method: "GET" | "POST",
  body?: unknown,
): Promise<{ status: number; payload: Record<string, unknown> }> {
  let loadedStatus = 502;
  const payload = await readThroughCloudCache({
    store: new LocalSyncStore(getDb()),
    scope,
    resource,
    id,
    maxAgeMs: ttl,
    load: async () => {
      const response = await forward(segment, method, body);
      loadedStatus = response.status;
      if (response.payload.ok !== true) {
        throw new Error(String(response.payload.reason ?? "brain-failed"));
      }
      return response.payload;
    },
  });
  return { status: loadedStatus === 502 ? 200 : loadedStatus, payload };
}

const brainRoute = new Hono()
  .get("/list", async (c) => {
    const { status, payload } = await cachedRead(
      await scopeForCache(),
      "brain-list",
      "all",
      BRAIN_LIST_TTL_MS,
      "list",
      "GET",
    );
    return c.json(payload, status as 200);
  })
  .get("/graph", async (c) => {
    const { status, payload } = await cachedRead(
      await scopeForCache(),
      "brain-graph",
      "all",
      BRAIN_LIST_TTL_MS,
      "graph",
      "GET",
    );
    return c.json(payload, status as 200);
  })
  .get("/export", async (c) => {
    const { status, payload } = await forward("export", "GET");
    return c.json(payload, status as 200);
  })
  .post("/read", async (c) => {
    const body = (await c.req.json()) as { path?: unknown };
    if (typeof body.path !== "string") {
      return c.json({ ok: false, reason: "invalid-path" }, 400);
    }
    const { status, payload } = await cachedRead(
      await scopeForCache(),
      "brain-file",
      body.path,
      BRAIN_BODY_TTL_MS,
      "read",
      "POST",
      { path: body.path },
    );
    return c.json(payload, status as 200);
  })
  .post("/write", async (c) => {
    const body = (await c.req.json()) as BrainWrite;
    if (typeof body.path !== "string" || typeof body.text !== "string") {
      return c.json({ ok: false, reason: "invalid-request" }, 400);
    }
    const scope = await scopeForCache();
    if (!scope) {
      const { status, payload } = await forward("write", "POST", body);
      return c.json(payload, status as 200);
    }
    const store = new LocalSyncStore(getDb());
    const previous = store.readCached(scope, "brain-file", body.path);
    const expectedRevision = body.ifMatch ?? previous?.revision ?? undefined;
    store.writeAndEnqueue({
      scope,
      resource: "brain-file",
      entityId: body.path,
      kind: "write",
      value: { ok: true, text: body.text, version: body.ifMatch ?? null },
      expectedRevision,
    });
    emitSyncEvent({ resource: "brain-file", entityId: body.path });
    emitSyncEvent({ resource: "brain-list" });
    void drainBrainOperations(scope);
    // The canonical revision is assigned by Cloud; do not pretend the old
    // ifMatch revision is current while this local-first operation is pending.
    return c.json({ ok: true, pending: true });
  })
  .post("/delete", async (c) => {
    const body = (await c.req.json()) as BrainDelete;
    if (typeof body.path !== "string") {
      return c.json({ ok: false, reason: "invalid-path" }, 400);
    }
    const scope = await scopeForCache();
    if (!scope) {
      const { status, payload } = await forward("delete", "POST", body);
      return c.json(payload, status as 200);
    }
    const store = new LocalSyncStore(getDb());
    store.deleteAndEnqueue({
      scope,
      resource: "brain-file",
      entityId: body.path,
    });
    emitSyncEvent({ resource: "brain-file", entityId: body.path });
    emitSyncEvent({ resource: "brain-list" });
    void drainBrainOperations(scope);
    return c.json({ ok: true, pending: true });
  })
  .post("/clear", async (c) => {
    const { status, payload } = await forward("clear", "POST", {});
    return c.json(payload, status as 200);
  });

export { drainBrainOperations, startBrainSyncDrain, stopBrainSyncDrain };
export default brainRoute;
