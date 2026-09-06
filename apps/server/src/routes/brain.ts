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

class BrainUpstreamError extends Error {
  constructor(
    readonly status: number,
    readonly payload: Record<string, unknown>,
  ) {
    super(String(payload.reason ?? "brain-failed"));
  }
}

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

const activeBrainDrains = new Map<string, Promise<void>>();
const requestedBrainDrains = new Set<string>();
const recoveredBrainScopes = new Set<string>();
const clearingBrainScopes = new Set<string>();

async function processBrainOperation(
  store: LocalSyncStore,
  scope: string,
  operation: ReturnType<LocalSyncStore["claimDueOperations"]>[number],
): Promise<void> {
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
    store.completeOperation(
      operation.operationId,
      operation.kind === "write" && typeof payload.version === "number"
        ? payload.version
        : undefined,
    );
    emitSyncEvent({
      resource: "brain-file",
      entityId: operation.entityId,
      source: "remote",
    });
    emitSyncEvent({ resource: "brain-list", source: "remote" });
    return;
  }
  const reason =
    typeof payload.reason === "string" ? payload.reason : `http-${status}`;
  if (reason === "conflict") {
    const current = (payload as unknown as CloudFailure).current;
    // Do not overwrite a newer local edit while its predecessor reports a
    // conflict. The failed head blocks that successor until the user retries,
    // preserving the edit rather than replacing it with stale Cloud content.
    if (current) {
      if (store.hasQueuedSuccessor(operation.operationId)) {
        store.updateCachedRevision({
          scope,
          resource: "brain-file",
          id: operation.entityId,
          revision: current.version,
        });
      } else {
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
    }
    store.failOperation(operation.operationId, "conflict");
    emitSyncEvent({
      resource: "brain-file",
      entityId: operation.entityId,
      source: "remote",
    });
    emitSyncEvent({ resource: "brain-list", source: "remote" });
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
}

async function drainBrainOperations(scope: string): Promise<void> {
  const active = activeBrainDrains.get(scope);
  if (active) {
    requestedBrainDrains.add(scope);
    return active;
  }
  const drain = (async () => {
    const store = new LocalSyncStore(getDb());
    if (!recoveredBrainScopes.has(scope)) {
      store.recoverSyncingOperations(scope, "brain-file");
      recoveredBrainScopes.add(scope);
    }
    do {
      requestedBrainDrains.delete(scope);
      while (true) {
        const operations = store.claimDueOperations(scope, "brain-file");
        if (operations.length === 0) break;
        await Promise.all(
          operations.map((operation) =>
            processBrainOperation(store, scope, operation),
          ),
        );
      }
    } while (requestedBrainDrains.has(scope));
  })();
  activeBrainDrains.set(scope, drain);
  try {
    await drain;
  } finally {
    if (activeBrainDrains.get(scope) === drain) {
      activeBrainDrains.delete(scope);
    }
  }
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
      if (response.payload.ok !== true)
        throw new BrainUpstreamError(response.status, response.payload);
      return response.payload;
    },
  });
  return { status: loadedStatus === 502 ? 200 : loadedStatus, payload };
}

async function respondCachedRead(
  load: () => Promise<{ status: number; payload: Record<string, unknown> }>,
): Promise<Response> {
  try {
    const { status, payload } = await load();
    return new Response(JSON.stringify(payload), {
      status,
      headers: { "content-type": "application/json" },
    });
  } catch (error) {
    if (error instanceof BrainUpstreamError) {
      return new Response(JSON.stringify(error.payload), {
        status: error.status,
        headers: { "content-type": "application/json" },
      });
    }
    throw error;
  }
}

const brainRoute = new Hono()
  .get("/list", async () => {
    const scope = await scopeForCache();
    return respondCachedRead(() =>
      cachedRead(scope, "brain-list", "all", BRAIN_LIST_TTL_MS, "list", "GET"),
    );
  })
  .get("/graph", async () => {
    const scope = await scopeForCache();
    return respondCachedRead(() =>
      cachedRead(
        scope,
        "brain-graph",
        "all",
        BRAIN_LIST_TTL_MS,
        "graph",
        "GET",
      ),
    );
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
    const path = body.path;
    const scope = await scopeForCache();
    return respondCachedRead(() =>
      cachedRead(scope, "brain-file", path, BRAIN_BODY_TTL_MS, "read", "POST", {
        path,
      }),
    );
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
    if (clearingBrainScopes.has(scope)) {
      return c.json({ ok: false, reason: "brain-clear-in-progress" }, 409);
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
    store.applyBrainListMutation({
      scope,
      kind: "write",
      path: body.path,
      text: body.text,
    });
    emitSyncEvent({
      resource: "brain-file",
      entityId: body.path,
      source: "local",
    });
    emitSyncEvent({ resource: "brain-list", source: "local" });
    void drainBrainOperations(scope).catch((error) =>
      log.error(`Brain operation drain failed: ${error}`),
    );
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
    if (clearingBrainScopes.has(scope)) {
      return c.json({ ok: false, reason: "brain-clear-in-progress" }, 409);
    }
    const store = new LocalSyncStore(getDb());
    store.deleteAndEnqueue({
      scope,
      resource: "brain-file",
      entityId: body.path,
    });
    store.applyBrainListMutation({
      scope,
      kind: "delete",
      path: body.path,
    });
    emitSyncEvent({
      resource: "brain-file",
      entityId: body.path,
      source: "local",
    });
    emitSyncEvent({ resource: "brain-list", source: "local" });
    void drainBrainOperations(scope).catch((error) =>
      log.error(`Brain operation drain failed: ${error}`),
    );
    return c.json({ ok: true, pending: true });
  })
  .post("/clear", async (c) => {
    const scope = await scopeForCache();
    if (!scope) {
      const { status, payload } = await forward("clear", "POST", {});
      return c.json(payload, status as 200);
    }
    clearingBrainScopes.add(scope);
    try {
      await drainBrainOperations(scope);
      const store = new LocalSyncStore(getDb());
      if (store.getBrainStatus(scope).pending > 0) {
        return c.json({ ok: false, reason: "brain-sync-pending" }, 409);
      }
      const { status, payload } = await forward("clear", "POST", {});
      if (payload.ok === true) {
        store.clearBrain(scope);
        emitSyncEvent({ resource: "brain-file", source: "remote" });
        emitSyncEvent({ resource: "brain-list", source: "remote" });
        emitSyncEvent({ resource: "brain-graph", source: "remote" });
      }
      return c.json(payload, status as 200);
    } finally {
      clearingBrainScopes.delete(scope);
    }
  });

export { drainBrainOperations, startBrainSyncDrain, stopBrainSyncDrain };
export default brainRoute;
