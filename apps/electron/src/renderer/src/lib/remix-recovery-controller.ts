import type { UIMessage } from "ai";
import { nextRemixReconnect, type RemixReconnectState } from "./remix-recovery";
import type { DurableThreadRuntime } from "./threads";

export const REMIX_CONTINUATION = "Continue from where you left off.";
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
type Saved = {
  request?: Admission;
  turn?: Turn;
  cancels: Array<{ turn?: Turn; request?: Admission }>;
  queue: RemixQueueItem[];
  completions: Completion[];
};
export type RemixRecoverySnapshot = {
  messages: UIMessage[];
  status: "ready" | "submitted" | "streaming" | "error";
  recovery: RemixReconnectState;
  queue: RemixQueueItem[];
  canonical: boolean;
  runtime: DurableThreadRuntime | null;
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
  }) => Promise<void>;
  requiresApproval?: (toolName: string) => boolean;
  onFinish?: (messages: UIMessage[]) => void;
  onError?: (error: Error) => void;
};
const terminal = new Set(["completed", "failed", "canceled"]);
const emptySaved = (): Saved => ({ cancels: [], queue: [], completions: [] });

/** Shared durable observer. Requests retain their admission ID across network
 * retries; only explicit Send or Resume creates a new user turn. */
export class RemixRecoveryController {
  private saved = emptySaved();
  private key = "";
  private ownerId = "";
  private timer: ReturnType<typeof setTimeout> | undefined;
  private inFlight: Promise<void> | null = null;
  private attempts = 0;
  private disposed = false;
  private generation = 0;
  private readonly listeners = new Set<() => void>();
  private readonly claims = new Map<string, Completion>();
  private readonly seenActions = new Set<string>();
  private readonly pendingApprovals = new Map<
    string,
    { turnId: string; toolName: string; input: unknown }
  >();
  private readonly clientId = crypto.randomUUID();
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
    if (method !== "GET" && this.ownerId) {
      const auth = await this.options.fetch("/api/auth/status");
      const identity = auth.ok
        ? ((await auth.json()) as { user?: { id: string } })
        : null;
      if (identity?.user?.id !== this.ownerId)
        throw Object.assign(
          new Error("Sign in with the account that started this conversation."),
          { status: 401 },
        );
    }
    const response = await this.options.fetch(
      path,
      body === undefined && method === "GET"
        ? undefined
        : {
            method,
            headers: { "Content-Type": "application/json" },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
          },
    );
    if (!response.ok)
      throw Object.assign(
        new Error(
          response.status === 401
            ? "Sign in to Freestyle Cloud to use Remix."
            : response.status === 429
              ? "You've hit this week's free limit."
              : `Remix request failed (${response.status}).`,
        ),
        { status: response.status },
      );
    return (await response.json()) as T;
  }
  initialize = (): Promise<void> => {
    this.initialized ??= (async () => {
      const auth = await this.json<{ user?: { id: string } }>(
        "/api/auth/status",
      );
      if (!auth.user?.id)
        throw Object.assign(
          new Error("Sign in to Freestyle Cloud to use Remix."),
          { status: 401 },
        );
      this.key = `remix.recovery.${auth.user.id}.${this.options.threadId}`;
      this.ownerId = auth.user.id;
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
      await this.command(completion.turnId, {
        type: "desktop_complete",
        ...completion,
      });
      this.saved.completions = this.saved.completions.filter(
        (entry) => entry !== completion,
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
      if (turn?.status === "retryable")
        throw new Error("The saved turn needs to reconnect.");
      const queue = await this.json<{
        items: RemixQueueItem[];
        active: boolean;
      }>(this.queuePath());
      this.saved.queue = queue.items;
      this.update({
        messages: hydrated,
        status: done ? "ready" : "streaming",
        recovery: { phase: "idle" },
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
      if (
        !done &&
        receipt?.checkpoint &&
        action?.kind === "desktop" &&
        action.status === "pending" &&
        !this.seenActions.has(action.id)
      ) {
        this.seenActions.add(action.id);
        // Show the checkpointed input first. Claim only after the user makes
        // a decision, so an unexecuted approval can move between windows.
        if (this.options.requiresApproval?.(action.toolName)) {
          const part = hydrated
            .flatMap((message) => message.parts)
            .find((part) => {
              const output = (
                part as { output?: { desktopAction?: { actionId?: string } } }
              ).output;
              return output?.desktopAction?.actionId === action.id;
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
            });
          } else {
            this.seenActions.delete(action.id);
          }
          this.schedule(1_000, () => {
            void this.observe();
          });
          this.attempts = 0;
          return;
        }
        let claim: { action: { toolName: string; input: unknown } };
        try {
          claim = (await this.command(action.turnId, {
            type: "desktop_claim",
            actionId: action.id,
            clientId: this.clientId,
          })) as typeof claim;
        } catch (error) {
          this.seenActions.delete(action.id);
          if ((error as { status?: number }).status !== 409) throw error;
          this.schedule(1_000, () => {
            void this.observe();
          });
          return;
        }
        if (generation !== this.generation || this.disposed) return;
        this.claims.set(action.id, {
          turnId: action.turnId,
          actionId: action.id,
          clientId: this.clientId,
          result: null,
        });
        await this.options.onToolCall({
          toolName: claim.action.toolName,
          toolCallId: action.id,
          input: claim.action.input,
        });
      }
      if (
        !done ||
        this.saved.cancels.length ||
        queue.items.length ||
        queue.active
      )
        this.schedule(1_000, () => {
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
    if (this.saved.turn || this.saved.request) {
      await this.enqueue(text, context);
      return;
    }
    this.generation++;
    clearTimeout(this.timer);
    if (this.inFlight) await this.inFlight;
    const index = messageId
      ? this.snapshot.messages.findIndex((message) => message.id === messageId)
      : -1;
    const prior =
      index >= 0
        ? this.snapshot.messages.slice(0, index)
        : this.snapshot.messages;
    const messages: UIMessage[] = [
      ...prior,
      {
        id: messageId ?? crypto.randomUUID(),
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
    const claim = (await this.command(pending.turnId, {
      type: "desktop_claim",
      actionId: toolCallId,
      clientId: this.clientId,
    })) as { action: { toolName: string; input: unknown } };
    if (
      claim.action.toolName !== pending.toolName ||
      JSON.stringify(claim.action.input) !== JSON.stringify(pending.input)
    )
      throw new Error("The action changed. Review it again before continuing.");
    this.pendingApprovals.delete(toolCallId);
    this.claims.set(toolCallId, {
      turnId: pending.turnId,
      actionId: toolCallId,
      clientId: this.clientId,
      result: null,
    });
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
  enqueue = async (text: string, context?: unknown) =>
    this.queueRequest(this.queuePath(), { text, context });
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
