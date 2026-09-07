import { agentActivityEvents } from "./agent-activity-events.js";
import { trustedDesktopAgentFields } from "./agent-request.js";
import { readSetting, writeSetting } from "./db.js";
import { freestyleCloudUrl } from "./freestyle-cloud.js";
import {
  deferRemixCancel,
  deferRemixRequestCancel,
  flushRemixCancels,
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
  activeTurnId?: string;
  steer?: boolean;
  paused?: boolean;
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
  if (!state.activeTurnId && !state.items.length) delete all[threadId];
  else all[threadId] = state;
  writeSetting(key, JSON.stringify(all));
  agentActivityEvents.publish(threadId);
}
export function remixQueueSnapshot(threadId: string) {
  const state = read(threadId);
  return {
    items: state.items.map(({ request: _request, ...item }) => item),
    active: Boolean(state.activeTurnId) && !state.paused,
    activeTurnId: state.activeTurnId ?? null,
  };
}
export function registerRemixTurn(threadId: string, turnId: string) {
  write(threadId, {
    ...read(threadId),
    activeTurnId: turnId,
    steer: false,
    paused: false,
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
    active: Boolean(state.activeTurnId) && !state.paused,
    queuedCount: state.items.length,
  }));
}
export function settleRemixTurn(turnId: string, status: string) {
  if (!["completed", "failed", "canceled"].includes(status)) return;
  for (const [threadId, state] of Object.entries(registry())) {
    if (state.activeTurnId !== turnId) continue;
    state.activeTurnId = undefined;
    state.steer = Boolean(state.steer || status === "completed");
    write(threadId, state);
  }
}
export function enqueueRemixMessage(
  threadId: string,
  input: { text: string; context?: unknown },
) {
  const state = read(threadId);
  state.items.push({
    ...input,
    id: crypto.randomUUID(),
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
  if (state.activeTurnId) {
    deferRemixCancel(state.activeTurnId);
    void flushRemixCancels();
  }
  write(threadId, state);
  void drainRemixQueues();
  return true;
}
const draining = new Set<string>();
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
      if (!response.ok) throw new Error("remix_queue_unavailable");
      const payload = await response.json();
      if (scope() !== key) throw new Error("remix_queue_account_changed");
      return payload;
    };
    let state = read(threadId);
    if (state.paused) return;
    if (state.activeTurnId) {
      const observedTurn = state.activeTurnId;
      const receipt = (await cloud(`remix/turns/${observedTurn}`)) as {
        turn: { status: string };
      };
      state = read(threadId);
      if (state.activeTurnId !== observedTurn) return;
      if (!["completed", "failed", "canceled"].includes(receipt.turn.status))
        return;
      state.activeTurnId = undefined;
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
    state.items = state.items.filter((entry) => entry.id !== item.id);
    state.activeTurnId = receipt.turn.id;
    state.steer = false;
    write(threadId, state);
    if (state.paused) {
      deferRemixCancel(receipt.turn.id);
      void flushRemixCancels();
    }
  } catch {
    // Retain the original request and queue item until an idempotent admission
    // succeeds. This worker runs independently of every renderer lifecycle.
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
          (state.activeTurnId || (state.items.length > 0 && state.steer)),
      )
      .map(([threadId]) => drainThread(threadId)),
  );
}
setInterval(() => {
  void drainRemixQueues().catch(() => {});
}, 1_000).unref();
