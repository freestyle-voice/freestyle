import { agentActivityEvents } from "./agent-activity-events.js";
import { trustedDesktopAgentFields } from "./agent-request.js";
import { readSetting, writeSetting } from "./db.js";
import { freestyleCloudUrl } from "./freestyle-cloud.js";
import {
  deferRemixCancel,
  deferRemixRequestCancel,
  flushRemixCancels,
  onRemixCancellationSettled,
} from "./remix-cancel-outbox.js";
import { getSession } from "./sessions.js";

export type RemixQueuedMessage = {
  id: string;
  text: string;
  context?: unknown;
  createdAt: number;
  request?: Record<string, unknown>;
};
type QueueState = {
  items: RemixQueuedMessage[];
  enqueueIds?: string[];
  activeTurnId?: string;
  steer?: boolean;
  paused?: boolean;
  activeRequest?: Record<string, unknown>;
  retryAttempts?: number;
  retryAt?: number;
  transportRetryAttempts?: number;
  transportRetryAt?: number;
  recoveryPaused?: boolean;
};
type Registry = Record<string, QueueState>;
function scope() {
  const session = getSession();
  return session
    ? `remix.queue.${encodeURIComponent(session.host)}.${session.user.id}`
    : null;
}
function registry(): Registry {
  const key = scope();
  return key ? (JSON.parse(readSetting(key) ?? "{}") as Registry) : {};
}
function read(threadId: string): QueueState {
  return registry()[threadId] ?? { items: [] };
}
function write(threadId: string, state: QueueState) {
  const key = scope();
  if (!key) throw new Error("cloud_auth_required");
  const all = registry();
  if (!state.activeTurnId && !state.items.length && !state.enqueueIds?.length)
    delete all[threadId];
  else all[threadId] = state;
  writeSetting(key, JSON.stringify(all));
  agentActivityEvents.publish(threadId);
}
export function remixQueueSnapshot(threadId: string) {
  const state = read(threadId);
  return {
    items: state.items.map(({ request: _request, ...item }) => item),
    active:
      Boolean(state.activeTurnId) && !state.paused && !state.recoveryPaused,
    activeTurnId: state.activeTurnId ?? null,
    recoveryPaused: Boolean(state.recoveryPaused),
  };
}
export function registerRemixTurn(
  threadId: string,
  turnId: string,
  request?: Record<string, unknown>,
) {
  write(threadId, {
    ...read(threadId),
    activeTurnId: turnId,
    steer: false,
    paused: false,
    activeRequest: request,
    retryAttempts: 0,
    retryAt: undefined,
    transportRetryAttempts: undefined,
    transportRetryAt: undefined,
    recoveryPaused: false,
  });
}
export function pauseRemixQueue(threadId: string) {
  const state = read(threadId);
  state.paused = true;
  state.steer = false;
  for (const item of state.items) {
    if (item.request)
      deferRemixRequestCancel({ ...item.request, clientRequestId: item.id });
  }
  write(threadId, state);
  return state.activeTurnId;
}
export function remixQueueActivity() {
  return Object.entries(registry()).map(([threadId, state]) => ({
    threadId,
    active:
      Boolean(state.activeTurnId) && !state.paused && !state.recoveryPaused,
    queuedCount: state.items.length,
    recoveryPaused: Boolean(state.recoveryPaused),
  }));
}
export function settleRemixTurn(turnId: string, status: string) {
  if (!["completed", "failed", "canceled"].includes(status)) return;
  for (const [threadId, state] of Object.entries(registry())) {
    if (state.activeTurnId !== turnId) continue;
    state.activeTurnId = undefined;
    state.activeRequest = undefined;
    state.recoveryPaused = false;
    state.steer = Boolean(state.steer || status === "completed");
    write(threadId, state);
  }
}
export function enqueueRemixMessage(
  threadId: string,
  input: { requestId?: string; text: string; context?: unknown },
) {
  const state = read(threadId);
  const { requestId = crypto.randomUUID(), ...message } = input;
  if (state.enqueueIds?.includes(requestId))
    return remixQueueSnapshot(threadId);
  state.enqueueIds = [...(state.enqueueIds ?? []), requestId];
  state.items.push({
    ...message,
    id: requestId,
    createdAt: Date.now(),
  });
  write(threadId, state);
  return remixQueueSnapshot(threadId);
}
export function updateRemixQueuedMessage(
  threadId: string,
  id: string,
  text: string,
) {
  const state = read(threadId);
  const item = state.items.find((item) => item.id === id);
  // A submitted receipt's request must remain immutable even if the network
  // dropped the response. Wait for that receipt before editing/removing it.
  if (!item || item.request) return false;
  item.text = text;
  write(threadId, state);
  return true;
}
export function removeRemixQueuedMessage(threadId: string, id: string) {
  const state = read(threadId);
  const item = state.items.find((item) => item.id === id);
  if (!item || item.request) return false;
  state.items = state.items.filter((item) => item.id !== id);
  write(threadId, state);
  return true;
}
export function steerRemixQueuedMessage(threadId: string, id: string) {
  const state = read(threadId);
  const item = state.items.find((item) => item.id === id);
  if (!item || item.request) return false;
  state.items = [item, ...state.items.filter((item) => item.id !== id)];
  state.steer = true;
  state.paused = false;
  state.recoveryPaused = false;
  state.retryAttempts = 0;
  state.retryAt = undefined;
  state.transportRetryAttempts = undefined;
  state.transportRetryAt = undefined;
  if (state.activeTurnId) {
    deferRemixCancel(state.activeTurnId);
    void flushRemixCancels();
  }
  write(threadId, state);
  void drainRemixQueues();
  return true;
}
const draining = new Set<string>();
const RETRY_DELAYS = [3_000, 6_000, 12_000, 24_000, 30_000];

function resetTransportRetry(threadId: string) {
  const state = read(threadId);
  if (
    state.transportRetryAttempts === undefined &&
    state.transportRetryAt === undefined
  )
    return;
  state.transportRetryAttempts = undefined;
  state.transportRetryAt = undefined;
  write(threadId, state);
}

function deferTransportRetry(threadId: string, key: string, error: unknown) {
  if (scope() !== key) return;
  const state = read(threadId);
  if (state.paused || state.recoveryPaused) return;
  const status = (error as { status?: number })?.status;
  // Authorization and malformed requests will not recover through a retry;
  // retain the queue for the visible Resume affordance instead of polling.
  if (
    status &&
    status >= 400 &&
    status < 500 &&
    status !== 408 &&
    status !== 429
  ) {
    state.recoveryPaused = true;
    state.transportRetryAt = undefined;
    write(threadId, state);
    return;
  }
  const attempts = (state.transportRetryAttempts ?? 0) + 1;
  state.transportRetryAttempts = attempts;
  if (attempts >= RETRY_DELAYS.length) {
    state.recoveryPaused = true;
    state.transportRetryAt = undefined;
  } else {
    state.transportRetryAt = Date.now() + RETRY_DELAYS[attempts - 1];
  }
  write(threadId, state);
}
onRemixCancellationSettled(({ turnId, clientRequestId }) => {
  for (const [threadId, state] of Object.entries(registry())) {
    let changed = false;
    for (const item of state.items) {
      if (!clientRequestId || item.request?.clientRequestId !== clientRequestId)
        continue;
      // The old admission is definitively canceled. Preserve the draft, but
      // detach it from that immutable receipt so edit/remove/steer work again.
      item.id = crypto.randomUUID();
      item.request = undefined;
      changed = true;
    }
    if (state.activeTurnId === turnId) {
      state.activeTurnId = undefined;
      state.activeRequest = undefined;
      state.recoveryPaused = false;
      changed = true;
    }
    if (changed) write(threadId, state);
  }
});
async function drainThread(threadId: string) {
  const session = getSession();
  const key = scope();
  if (!session || !key) return;
  const lock = `${key}.${threadId}`;
  if (draining.has(lock)) return;
  draining.add(lock);
  try {
    const cloud = async (path: string, body?: unknown) => {
      const response = await fetch(`${freestyleCloudUrl()}/v2/${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          Authorization: `Bearer ${session.token}`,
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok)
        throw Object.assign(new Error("remix_queue_unavailable"), {
          status: response.status,
        });
      const payload = await response.json();
      if (scope() !== key) throw new Error("remix_queue_account_changed");
      resetTransportRetry(threadId);
      return payload;
    };
    let state = read(threadId);
    if (state.paused || state.recoveryPaused) return;
    if (state.transportRetryAt) {
      if (Date.now() < state.transportRetryAt) return;
      state.transportRetryAt = undefined;
      write(threadId, state);
    }
    if (state.activeTurnId) {
      const observedTurn = state.activeTurnId;
      const receipt = (await cloud(`remix/turns/${observedTurn}`)) as {
        turn: { status: string; clientRequestId?: string };
        checkpoint?: { messages: unknown[]; context: unknown };
      };
      state = read(threadId);
      if (
        state.activeTurnId !== observedTurn ||
        state.paused ||
        state.recoveryPaused
      )
        return;
      if (["retryable", "queued"].includes(receipt.turn.status)) {
        const attempts = state.retryAttempts ?? 0;
        if (attempts >= RETRY_DELAYS.length) {
          state.recoveryPaused = true;
          write(threadId, state);
          return;
        }
        state.activeRequest ??=
          receipt.checkpoint && receipt.turn.clientRequestId
            ? {
                threadId,
                clientRequestId: receipt.turn.clientRequestId,
                messages: receipt.checkpoint.messages,
                context: receipt.checkpoint.context,
                ...trustedDesktopAgentFields(),
              }
            : undefined;
        if (!state.activeRequest) {
          state.recoveryPaused = true;
          write(threadId, state);
          return;
        }
        if (!state.retryAt) {
          state.retryAt = Date.now() + RETRY_DELAYS[attempts];
          write(threadId, state);
          return;
        }
        if (Date.now() < state.retryAt) return;
        state.retryAttempts = attempts + 1;
        state.retryAt = undefined;
        write(threadId, state);
        await cloud("remix/turns", state.activeRequest);
        return;
      }
      state.retryAttempts = 0;
      state.retryAt = undefined;
      if (!["completed", "failed", "canceled"].includes(receipt.turn.status))
        return;
      state.activeTurnId = undefined;
      state.activeRequest = undefined;
      // Failure/Stop preserve the queue until the user sends or steers again.
      if (receipt.turn.status !== "completed" && !state.steer) {
        write(threadId, state);
        return;
      }
      state.steer = true;
      write(threadId, state);
    }
    if (state.paused || !state.steer || !state.items.length) return;
    const item = state.items[0];
    if (!item.request) {
      const runtime = (await cloud(
        `threads/${encodeURIComponent(threadId)}`,
      )) as { thread: { messages: unknown[] } };
      state = read(threadId);
      if (state.paused || state.activeTurnId || state.items[0]?.id !== item.id)
        return;
      state.items[0].request = {
        threadId,
        clientRequestId: item.id,
        messages: [
          ...runtime.thread.messages,
          {
            id: item.id,
            role: "user",
            parts: [{ type: "text", text: item.text }],
          },
        ],
        context: item.context ?? {
          selection: null,
          appName: null,
          windowTitle: null,
          capturedAt: Date.now(),
        },
        ...trustedDesktopAgentFields(),
      };
      write(threadId, state);
    }
    const receipt = (await cloud("remix/turns", state.items[0].request)) as {
      turn: { id: string };
    };
    state = read(threadId);
    if (!state.items.some((entry) => entry.id === item.id)) return;
    state.activeRequest = state.items.find(
      (entry) => entry.id === item.id,
    )!.request;
    state.items = state.items.filter((entry) => entry.id !== item.id);
    state.activeTurnId = receipt.turn.id;
    state.steer = false;
    state.retryAttempts = 0;
    state.retryAt = undefined;
    write(threadId, state);
    if (state.paused) {
      deferRemixCancel(receipt.turn.id);
      void flushRemixCancels();
    }
  } catch (error) {
    // Retain the original request and queue item until an idempotent admission
    // succeeds. This worker runs independently of every renderer lifecycle.
    deferTransportRetry(threadId, key, error);
  } finally {
    draining.delete(lock);
  }
}
export async function drainRemixQueues() {
  await Promise.all(
    Object.entries(registry())
      .filter(
        ([, state]) =>
          !state.paused &&
          !state.recoveryPaused &&
          (state.activeTurnId || (state.items.length > 0 && state.steer)),
      )
      .map(([threadId]) => drainThread(threadId)),
  );
}
setInterval(() => {
  void drainRemixQueues().catch(() => {});
}, 1_000).unref();
