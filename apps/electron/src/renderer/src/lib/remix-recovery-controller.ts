import type { UIMessage } from "ai";
import { nextRemixReconnect, type RemixReconnectState } from "./remix-recovery";
import type { DurableThreadRuntime } from "./threads";

export const REMIX_CONTINUATION = "Continue from where you left off.";
const OBSERVATION_INTERVAL = 2_500;
type Turn = {
  id: string;
  status: string;
  error?: string | null;
  clientRequestId?: string;
};
type Admission = {
  threadId: string;
  clientRequestId: string;
  messages: UIMessage[];
  context: unknown;
  firstTurn?: boolean;
};
type Receipt = {
  turn: Turn;
  checkpoint?: {
    messages?: UIMessage[];
    context?: unknown;
    assistant?: UIMessage | null;
    toolState?:
      | { actionId?: string; status?: string }[]
      | { actionId?: string; status?: string }
      | null;
  } | null;
};
export type RemixQueueItem = {
  id: string;
  text: string;
  createdAt: number;
  context?: unknown;
};
type Completion = {
  turnId: string;
  actionId: string;
  clientId: string;
  result: unknown;
};
type ActionReceipt = {
  id: string;
  turnId: string;
  status: string;
  toolName: string;
  invocationId?: string | null;
  retryOfActionId?: string | null;
};
type ClaimIntent = {
  turnId: string;
  clientId: string;
  toolName: string;
  input: unknown;
  phase: "claiming" | "executing";
};
type Saved = {
  request?: Admission;
  turn?: Turn;
  cancels: Array<{ turn?: Turn; request?: Admission }>;
  queue: RemixQueueItem[];
  completions: Completion[];
  enqueues: Array<{ requestId: string; text: string; context?: unknown }>;
  claimIntents: Record<string, ClaimIntent>;
  desktopRetries: Record<string, string>;
  retrySources: Record<string, string>;
  confirmActions: string[];
};
export type RemixRecoverySnapshot = {
  messages: UIMessage[];
  status: "ready" | "submitted" | "streaming" | "error";
  recovery: RemixReconnectState;
  queue: RemixQueueItem[];
  canonical: boolean;
  runtime: DurableThreadRuntime | null;
  desktopRecovery: { turnId: string; actionId: string } | null;
};
type Options = {
  threadId: string;
  messages: UIMessage[];
  fetch: (path: string, init?: RequestInit) => Promise<Response>;
  storage?: Pick<Storage, "getItem" | "setItem">;
  onToolCall: (call: {
    toolName: string;
    toolCallId: string;
    input: unknown;
    requiresConfirmation?: boolean;
  }) => Promise<void>;
  requiresApproval?: (toolName: string) => boolean;
  onFinish?: (messages: UIMessage[]) => void;
  onError?: (error: Error) => void;
  onFork?: (thread: { id: string; messages: UIMessage[] }) => void;
  onActionUnavailable?: (actionId: string) => void;
};
const terminal = new Set(["completed", "failed", "canceled"]);
const emptySaved = (): Saved => ({
  cancels: [],
  queue: [],
  completions: [],
  enqueues: [],
  claimIntents: {},
  desktopRetries: {},
  retrySources: {},
  confirmActions: [],
});

/** Shared durable observer. Requests retain their admission ID across network
 * retries; only explicit Send or Resume creates a new user turn. */
export class RemixRecoveryController {
  private saved = emptySaved();
  private key = "";
  private ownerId = "";
  private ownerHost = "";
  private timer: ReturnType<typeof setTimeout> | undefined;
  private inFlight: Promise<void> | null = null;
  private attempts = 0;
  private queueHandoffCheckPending = false;
  private disposed = false;
  private generation = 0;
  private readonly listeners = new Set<() => void>();
  private readonly claims = new Map<string, Completion>();
  private readonly seenActions = new Set<string>();
  private readonly pendingApprovals = new Map<
    string,
    { turnId: string; toolName: string; input: unknown }
  >();
  private readonly observerId = crypto.randomUUID();
  private readonly authorizing = new Set<string>();
  private initialized: Promise<void> | null = null;
  private snapshot: RemixRecoverySnapshot;
  constructor(private readonly options: Options) {
    this.snapshot = {
      messages: options.messages,
      status: "ready",
      recovery: { phase: "idle" },
      queue: [],
      canonical: false,
      runtime: null,
      desktopRecovery: null,
    };
  }
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private update(patch: Partial<RemixRecoverySnapshot>) {
    if (this.disposed) return;
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener();
  }
  private persist() {
    if (this.key)
      this.options.storage?.setItem(this.key, JSON.stringify(this.saved));
  }
  private async json<T>(
    path: string,
    body?: unknown,
    method = body === undefined ? "GET" : "POST",
  ): Promise<T> {
    const response = await this.options.fetch(path, {
      method,
      // Reads are account-scoped too. A mounted observer can outlive a
      // sign-out, so every request after identity discovery must carry the
      // identity it was initialized under.
      headers: {
        "X-Remix-User": this.ownerId,
        "X-Remix-Host": encodeURIComponent(this.ownerHost),
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok) {
      const failure = (await response
        .clone()
        .json()
        .catch(() => null)) as { code?: unknown } | null;
      const rateLimited = failure?.code === "rate_limited";
      throw Object.assign(
        new Error(
          response.status === 401
            ? "Sign in to Freestyle Cloud to use Remix."
            : response.status === 429
              ? rateLimited
                ? "Remix is receiving too many updates. Try again in a moment."
                : "You've hit this week's free limit."
              : `Remix request failed (${response.status}).`,
        ),
        { status: response.status },
      );
    }
    return (await response.json()) as T;
  }
  initialize = (): Promise<void> => {
    this.initialized ??= (async () => {
      const auth = await this.json<{ userId: string; host: string }>(
        "/api/remix/identity",
      );
      if (!auth.userId || !auth.host)
        throw Object.assign(
          new Error("Sign in to Freestyle Cloud to use Remix."),
          { status: 401 },
        );
      this.key = `remix.recovery.${encodeURIComponent(auth.host)}.${auth.userId}.${this.options.threadId}`;
      this.ownerId = auth.userId;
      this.ownerHost = auth.host;
      const stored = this.options.storage?.getItem(this.key);
      if (stored)
        this.saved = { ...emptySaved(), ...(JSON.parse(stored) as Saved) };
      this.update({ queue: this.saved.queue });
    })().catch((error) => {
      this.initialized = null;
      throw error;
    });
    return this.initialized;
  };
  start = async () => {
    this.disposed = false;
    await this.observe();
  };
  dispose = () => {
    this.disposed = true;
    this.generation++;
    clearTimeout(this.timer);
  };
  detach = () => {
    this.generation++;
    clearTimeout(this.timer);
    this.update({ status: "ready" });
  };
  setMessages = (
    messages: UIMessage[] | ((messages: UIMessage[]) => UIMessage[]),
  ) => {
    this.update({
      messages:
        typeof messages === "function"
          ? messages(this.snapshot.messages)
          : messages,
    });
  };
  clearError = () => {
    if (this.snapshot.status === "error") this.update({ status: "ready" });
  };
  private schedule(delay: number, action: () => void) {
    clearTimeout(this.timer);
    if (!this.disposed) this.timer = setTimeout(action, delay);
  }
  private failed(error: unknown) {
    if (this.disposed) return;
    const status = (error as { status?: number })?.status;
    if (status && status >= 400 && status < 500 && status !== 408) {
      clearTimeout(this.timer);
      if (!this.saved.turn) {
        this.saved.request = undefined;
        this.persist();
      }
      this.update({ status: "error", recovery: { phase: "idle" } });
      this.options.onError?.(error as Error);
      return;
    }
    const recovery = nextRemixReconnect(this.attempts, Date.now());
    this.update({ status: "error", recovery });
    if (recovery.phase === "reconnecting")
      this.schedule(recovery.retryAt - Date.now(), () => {
        void this.retry();
      });
  }
  retry = async () => {
    if (
      this.inFlight ||
      this.disposed ||
      this.snapshot.recovery.phase === "paused"
    )
      return;
    clearTimeout(this.timer);
    this.attempts++;
    await this.observe();
  };
  private command(turnId: string, body: unknown) {
    return this.json(
      `/api/remix/turns/${encodeURIComponent(turnId)}/commands`,
      body,
    );
  }
  private async actionReceipt(turnId: string, actionId: string) {
    const { action } = await this.json<{ action: ActionReceipt }>(
      `/api/remix/turns/${encodeURIComponent(turnId)}/actions/${encodeURIComponent(actionId)}`,
    );
    if (
      action?.id !== actionId ||
      action.turnId !== turnId ||
      typeof action.status !== "string"
    )
      throw new Error("Could not verify this desktop action.");
    return action;
  }
  private async flush() {
    for (const cancel of [...this.saved.cancels]) {
      if (cancel.turn)
        await this.command(cancel.turn.id, {
          type: "cancel",
          threadId: this.options.threadId,
        });
      else if (cancel.request)
        await this.json("/api/remix/cancel", { request: cancel.request });
      this.saved.cancels = this.saved.cancels.filter(
        (entry) => entry !== cancel,
      );
      this.persist();
    }
    for (const completion of [...this.saved.completions]) {
      try {
        await this.command(completion.turnId, {
          type: "desktop_complete",
          ...completion,
        });
      } catch (error) {
        const status = (error as { status?: number }).status;
        if (status !== 409 && status !== 404) throw error;
        // A canceled/settled turn can no longer accept first completion.
        // Retire that output only after authoritative reconciliation; network
        // uncertainty remains replayable and never causes local reexecution.
        const receipt = await this.json<Receipt>(
          `/api/remix/turns/${completion.turnId}`,
        );
        const tools = Array.isArray(receipt.checkpoint?.toolState)
          ? receipt.checkpoint.toolState
          : [receipt.checkpoint?.toolState];
        const settledAction = tools.some(
          (action) =>
            action?.actionId === completion.actionId &&
            ["expired", "declined", "completed", "failed"].includes(
              action.status ?? "",
            ),
        );
        if (!terminal.has(receipt.turn.status) && !settledAction) {
          // Check the predecessor itself: the checkpoint intentionally replaces
          // its ID with the retry successor for the same invocation.
          const action = await this.actionReceipt(
            completion.turnId,
            completion.actionId,
          );
          if (
            ![
              "expired",
              "declined",
              "completed",
              "failed",
              "canceled",
            ].includes(action.status)
          )
            throw error;
        }
      }
      this.saved.completions = this.saved.completions.filter(
        (entry) => entry !== completion,
      );
      const retired = new Set<string>();
      let actionId: string | undefined = completion.actionId;
      while (actionId && !retired.has(actionId)) {
        retired.add(actionId);
        delete this.saved.claimIntents[actionId];
        const predecessor: string | undefined =
          this.saved.retrySources[actionId];
        if (predecessor) delete this.saved.desktopRetries[predecessor];
        delete this.saved.retrySources[actionId];
        actionId = predecessor;
      }
      this.saved.confirmActions = this.saved.confirmActions.filter(
        (id) => !retired.has(id),
      );
      this.persist();
    }
    for (const pending of [...this.saved.enqueues]) {
      await this.queueRequest(this.queuePath(), pending);
      this.saved.enqueues = this.saved.enqueues.filter(
        (item) => item.requestId !== pending.requestId,
      );
      this.persist();
    }
  }
  private observe = (): Promise<void> => {
    if (this.inFlight) return this.inFlight;
    const generation = this.generation;
    this.inFlight = (async () => {
      await this.initialize();
      await this.flush();
      if (generation !== this.generation || this.disposed) return;
      if (this.saved.turn?.status === "retryable") {
        const queue = await this.json<{
          items: RemixQueueItem[];
          recoveryPaused?: boolean;
        }>(this.queuePath());
        if (queue.recoveryPaused) {
          this.update({
            queue: queue.items,
            status: "error",
            recovery: { phase: "paused", attempts: 5 },
          });
          return;
        }
      }
      if (
        this.saved.request &&
        (!this.saved.turn ||
          ["retryable", "queued"].includes(this.saved.turn.status))
      ) {
        const receipt = await this.json<Receipt>(
          "/api/remix/turns",
          this.saved.request,
        );
        if (generation !== this.generation || this.disposed) return;
        this.saved.turn = receipt.turn;
        this.persist();
      }
      let runtime: DurableThreadRuntime | null = null;
      try {
        runtime = await this.json<DurableThreadRuntime>(
          `/api/remix/thread/${encodeURIComponent(this.options.threadId)}`,
        );
      } catch (error) {
        if (
          (error as { status?: number }).status !== 404 ||
          this.saved.request ||
          this.saved.turn
        )
          throw error;
      }
      if (generation !== this.generation || this.disposed) return;
      this.saved.turn ??= runtime?.activeTurn ?? undefined;
      let receipt: Receipt | null = null;
      if (this.saved.turn) {
        receipt = await this.json<Receipt>(
          `/api/remix/turns/${this.saved.turn.id}`,
        );
        if (generation !== this.generation || this.disposed) return;
        this.saved.turn = receipt.turn;
        if (
          !this.saved.request &&
          receipt.turn.clientRequestId &&
          receipt.checkpoint?.messages
        )
          this.saved.request = {
            threadId: this.options.threadId,
            clientRequestId: receipt.turn.clientRequestId,
            messages: receipt.checkpoint.messages,
            context: receipt.checkpoint.context,
          };
        this.persist();
      }
      const messages = runtime?.thread?.messages ?? this.snapshot.messages;
      const assistant = receipt?.checkpoint?.assistant;
      const hydrated = assistant
        ? [
            ...messages.filter((message) => message.id !== assistant.id),
            assistant,
          ]
        : messages;
      const turn = this.saved.turn;
      const done = !turn || terminal.has(turn.status);
      const queue = await this.json<{
        items: RemixQueueItem[];
        active: boolean;
        recoveryPaused?: boolean;
      }>(this.queuePath());
      if (turn?.status === "retryable" && !queue.recoveryPaused)
        throw new Error("The saved turn needs to reconnect.");
      this.saved.queue = queue.items;
      const needsHandoffCheck =
        queue.items.length > 0 && !queue.active && !queue.recoveryPaused;
      const shouldConfirmHandoff =
        needsHandoffCheck && !this.queueHandoffCheckPending;
      this.queueHandoffCheckPending = needsHandoffCheck;
      this.update({
        messages: hydrated,
        status: done ? "ready" : "streaming",
        recovery: queue.recoveryPaused
          ? { phase: "paused", attempts: 5 }
          : { phase: "idle" },
        canonical: Boolean(receipt?.checkpoint),
        runtime,
        queue: queue.items,
      });
      if (turn && done) {
        this.attempts = 0;
        this.saved.turn = undefined;
        this.saved.request = undefined;
        this.persist();
        this.options.onFinish?.(hydrated);
        if (turn.status === "failed")
          this.options.onError?.(
            new Error(turn.error || "Remix couldn't complete this turn."),
          );
      }
      const action = runtime?.pendingAction;
      for (const actionId of this.pendingApprovals.keys()) {
        if (action?.id === actionId && !done) continue;
        this.pendingApprovals.delete(actionId);
        this.options.onActionUnavailable?.(actionId);
      }
      const checkpointActions = (assistant?.parts ?? []).flatMap((part) => {
        const id = (
          part as { output?: { desktopAction?: { actionId?: string } } }
        ).output?.desktopAction?.actionId;
        return id ? [id] : [];
      });
      const tools = Array.isArray(receipt?.checkpoint?.toolState)
        ? receipt.checkpoint.toolState
        : [receipt?.checkpoint?.toolState];
      const interruptedActionId =
        tools.find((tool) => tool?.status === "expired")?.actionId ??
        checkpointActions.at(-1);
      this.update({
        desktopRecovery:
          turn?.status === "needs_desktop" && interruptedActionId
            ? { turnId: turn.id, actionId: interruptedActionId }
            : null,
      });
      if (
        !done &&
        receipt?.checkpoint &&
        action?.kind === "desktop" &&
        (action.status === "pending" ||
          this.saved.claimIntents[action.id]?.phase === "claiming") &&
        !this.seenActions.has(action.id)
      ) {
        const ownedAction = await this.actionReceipt(action.turnId, action.id);
        const lineage = new Set([action.id]);
        let ancestor = ownedAction;
        while (
          ancestor.retryOfActionId &&
          !lineage.has(ancestor.retryOfActionId)
        ) {
          const predecessor = ancestor.retryOfActionId;
          lineage.add(predecessor);
          this.saved.retrySources[ancestor.id] = predecessor;
          if (checkpointActions.includes(predecessor)) break;
          ancestor = await this.actionReceipt(action.turnId, predecessor);
        }
        if (generation !== this.generation || this.disposed) return;
        this.seenActions.add(action.id);
        // Show the checkpointed input first. Claim only after the user makes
        // a decision, so an unexecuted approval can move between windows.
        const retrySource =
          this.saved.retrySources[action.id] ??
          Object.keys(this.saved.desktopRetries)
            .reverse()
            .find(
              (id) =>
                this.saved.claimIntents[id]?.turnId === action.turnId ||
                checkpointActions.includes(id),
            );
        const explicitRetry =
          Boolean(ownedAction.retryOfActionId) ||
          this.saved.confirmActions.includes(action.id) ||
          Boolean(retrySource);
        if (retrySource) {
          // Recover the replacement relationship even if retry_desktop committed
          // but its response was lost, so completion retires the retry intent.
          this.saved.retrySources[action.id] = retrySource;
          this.persist();
        }
        if (this.options.requiresApproval?.(action.toolName) || explicitRetry) {
          const part = (assistant?.parts ?? []).find((part) => {
            const output = (
              part as { output?: { desktopAction?: { actionId?: string } } }
            ).output;
            const id = output?.desktopAction?.actionId;
            return (
              id === action.id ||
              (explicitRetry && Boolean(id && lineage.has(id))) ||
              (explicitRetry && Boolean(id && this.saved.desktopRetries[id]))
            );
          }) as { input?: unknown } | undefined;
          if (part) {
            this.pendingApprovals.set(action.id, {
              turnId: action.turnId,
              toolName: action.toolName,
              input: part.input,
            });
            await this.options.onToolCall({
              toolName: action.toolName,
              toolCallId: action.id,
              input: part.input,
              requiresConfirmation: explicitRetry,
            });
          } else {
            this.seenActions.delete(action.id);
          }
          // An approval cannot make forward progress until the user decides.
          // `complete()` restarts observation immediately after that decision;
          // polling here only hammers the durable snapshot endpoints.
          this.attempts = 0;
          return;
        }
        let claim: { toolName: string; input: unknown };
        try {
          claim = await this.claimAction(action.id, {
            turnId: action.turnId,
            toolName: action.toolName,
          });
        } catch (error) {
          this.seenActions.delete(action.id);
          if ((error as { status?: number }).status !== 409) throw error;
          this.schedule(1_000, () => {
            void this.observe();
          });
          return;
        }
        if (generation !== this.generation || this.disposed) return;
        await this.options.onToolCall({
          toolName: claim.toolName,
          toolCallId: action.id,
          input: claim.input,
        });
      }
      if (
        !queue.recoveryPaused &&
        (!done ||
          this.saved.cancels.length ||
          queue.active ||
          shouldConfirmHandoff)
      )
        this.schedule(OBSERVATION_INTERVAL, () => {
          void this.observe();
        });
      this.attempts = 0;
    })()
      .catch((error) => {
        if (generation === this.generation) this.failed(error);
      })
      .finally(() => {
        this.inFlight = null;
      });
    return this.inFlight;
  };
  send = async (text: string, context: unknown, messageId?: string) => {
    await this.initialize();
    if (messageId) {
      if (!this.options.onFork) throw new Error("Editing requires a new chat.");
      const index = this.snapshot.messages.findIndex(
        (message) => message.id === messageId && message.role === "user",
      );
      if (index < 0)
        throw new Error("The original message is no longer available.");
      const id = crypto.randomUUID();
      const messages: UIMessage[] = [
        ...this.snapshot.messages.slice(0, index),
        {
          id: crypto.randomUUID(),
          role: "user" as const,
          parts: [{ type: "text" as const, text }],
        },
      ].map((message) => ({ ...message, id: crypto.randomUUID() }));
      const saved: Saved = {
        ...emptySaved(),
        request: {
          threadId: id,
          clientRequestId: crypto.randomUUID(),
          messages,
          context,
          firstTurn: true,
        },
      };
      this.options.storage?.setItem(
        `remix.recovery.${encodeURIComponent(this.ownerHost)}.${this.ownerId}.${id}`,
        JSON.stringify(saved),
      );
      this.options.onFork({ id, messages });
      return;
    }
    if (this.saved.turn || this.saved.request) {
      await this.enqueue(text, context);
      return;
    }
    this.generation++;
    clearTimeout(this.timer);
    if (this.inFlight) await this.inFlight;
    const messages: UIMessage[] = [
      ...this.snapshot.messages,
      {
        id: crypto.randomUUID(),
        role: "user",
        parts: [{ type: "text", text }],
      },
    ];
    this.saved.request = {
      threadId: this.options.threadId,
      clientRequestId: crypto.randomUUID(),
      messages,
      context,
      firstTurn: messages.length === 1,
    };
    this.attempts = 0;
    this.persist();
    this.update({
      messages,
      status: "submitted",
      recovery: { phase: "idle" },
      queue: [...this.saved.queue],
    });
    await this.observe();
  };
  stop = async () => {
    await this.initialize();
    this.generation++;
    clearTimeout(this.timer);
    if (this.saved.turn || this.saved.request)
      this.saved.cancels.push({
        turn: this.saved.turn,
        request: this.saved.request,
      });
    this.saved.turn = undefined;
    this.saved.request = undefined;
    this.persist();
    this.update({ status: "ready", recovery: { phase: "idle" } });
    const flush = () => {
      void this.flush().catch(() => this.schedule(3_000, flush));
    };
    flush();
  };
  resume = async (context: unknown) => {
    await this.stop();
    await this.send(REMIX_CONTINUATION, context);
  };
  complete = async (toolCallId: string, result: unknown) => {
    const claim = this.claims.get(toolCallId);
    if (!claim) return;
    this.claims.delete(toolCallId);
    this.saved.completions.push({ ...claim, result });
    this.persist();
    try {
      await this.flush();
      this.schedule(0, () => {
        void this.observe();
      });
    } catch (error) {
      this.failed(error);
    }
  };
  authorizeTool = async (toolCallId: string) => {
    const pending = this.pendingApprovals.get(toolCallId);
    if (!pending) throw new Error("This approval is no longer available.");
    await this.claimAction(toolCallId, pending);
    this.pendingApprovals.delete(toolCallId);
  };
  private async claimAction(
    toolCallId: string,
    pending: { turnId: string; toolName: string; input?: unknown },
  ) {
    if (this.authorizing.has(toolCallId))
      throw new Error("This action is already being confirmed.");
    this.authorizing.add(toolCallId);
    try {
      return await this.claimActionOnce(toolCallId, pending);
    } finally {
      this.authorizing.delete(toolCallId);
    }
  }
  private async claimActionOnce(
    toolCallId: string,
    pending: { turnId: string; toolName: string; input?: unknown },
  ) {
    let intent = this.saved.claimIntents[toolCallId];
    if (intent?.phase === "executing")
      throw new Error(
        "This action may already have run. Wait for recovery before retrying.",
      );
    intent ??= {
      ...pending,
      input: pending.input,
      clientId: crypto.randomUUID(),
      phase: "claiming",
    };
    this.saved.claimIntents[toolCallId] = intent;
    this.persist();
    // Cloud must replay the SAME live claim for this claimant, without a new
    // lease, when the original successful claim response was lost.
    const claim = (await this.command(pending.turnId, {
      type: "desktop_claim",
      actionId: toolCallId,
      clientId: intent.clientId,
      observerId: this.observerId,
    })) as { action: { toolName: string; input: unknown } };
    if (
      claim.action.toolName !== pending.toolName ||
      (pending.input !== undefined &&
        JSON.stringify(claim.action.input) !== JSON.stringify(pending.input))
    )
      throw new Error("The action changed. Review it again before continuing.");
    intent.phase = "executing";
    intent.input = claim.action.input;
    this.persist();
    this.claims.set(toolCallId, {
      turnId: pending.turnId,
      actionId: toolCallId,
      clientId: intent.clientId,
      result: null,
    });
    return claim.action;
  }
  retryDesktop = async () => {
    const action = this.snapshot.desktopRecovery;
    if (!action) return;
    this.saved.desktopRetries[action.actionId] ??= crypto.randomUUID();
    this.persist();
    const result = (await this.command(action.turnId, {
      type: "retry_desktop",
      actionId: action.actionId,
      clientRequestId: this.saved.desktopRetries[action.actionId],
    })) as { action: { id: string } };
    this.saved.confirmActions.push(result.action.id);
    this.saved.retrySources[result.action.id] = action.actionId;
    this.persist();
    this.update({ desktopRecovery: null });
    await this.observe();
  };
  private queuePath() {
    return `/api/remix/${encodeURIComponent(this.options.threadId)}/queue`;
  }
  private async queueRequest(path: string, body?: unknown, method?: string) {
    await this.initialize();
    const queue = await this.json<{ items: RemixQueueItem[] }>(
      path,
      body,
      method,
    );
    this.saved.queue = queue.items;
    this.persist();
    this.update({ queue: queue.items });
  }
  enqueue = async (text: string, context?: unknown) => {
    await this.initialize();
    const pending = { requestId: crypto.randomUUID(), text, context };
    this.saved.enqueues.push(pending);
    this.persist();
    this.update({
      queue: [
        ...this.snapshot.queue,
        { id: pending.requestId, text, context, createdAt: Date.now() },
      ],
    });
    try {
      await this.queueRequest(this.queuePath(), pending);
      this.saved.enqueues = this.saved.enqueues.filter(
        (item) => item.requestId !== pending.requestId,
      );
      this.persist();
    } catch (error) {
      const status = (error as { status?: number }).status;
      if (status && status >= 400 && status < 500 && status !== 408) {
        this.saved.enqueues = this.saved.enqueues.filter(
          (item) => item.requestId !== pending.requestId,
        );
        this.persist();
        this.update({
          queue: this.snapshot.queue.filter(
            (item) => item.id !== pending.requestId,
          ),
        });
        throw error;
      }
      // The local enqueue receipt may already exist. Retain the intent, don't
      // restore a draft that would become a second independent user send.
      this.failed(error);
    }
  };
  updateQueued = async (id: string, text: string) =>
    this.queueRequest(
      `${this.queuePath()}/${encodeURIComponent(id)}`,
      { text },
      "PATCH",
    );
  removeQueued = async (id: string) =>
    this.queueRequest(
      `${this.queuePath()}/${encodeURIComponent(id)}`,
      undefined,
      "DELETE",
    );
  steer = async (id: string) => {
    await this.queueRequest(
      `${this.queuePath()}/${encodeURIComponent(id)}/steer`,
      {},
      "POST",
    );
    this.attempts = 0;
    await this.observe();
  };
}
