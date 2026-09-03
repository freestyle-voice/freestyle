/**
 * A local, in-memory owner for one active Cloud agent stream. Renderers are
 * observers: losing a BrowserWindow only removes that observer, never the
 * upstream reader that lets Cloud persist the completed conversation.
 *
 * This store intentionally lives in the local Hono process. It is not a
 * replacement for Cloud durability across an app quit; it makes renderer
 * handoffs, reloads, and pill/workspace transitions reliable within a running
 * desktop application.
 */
import { agentActivityEvents } from "./agent-activity-events.js";

type ActiveStream = {
  inputMessages: unknown[];
  replay: Uint8Array[];
  subscribers: Set<ReadableStreamDefaultController<Uint8Array>>;
  reader: ReadableStreamDefaultReader<Uint8Array> | null;
  complete: boolean;
  cancelled: boolean;
  cleared: boolean;
  onComplete?: (result: AgentStreamCompletion) => void | Promise<void>;
};

export type AgentStreamCompletion = {
  inputMessages: unknown[];
  cancelled: boolean;
};

export type AgentStreamStartOptions = {
  /** Runs after observers close and the active entry has been released. */
  onComplete?: (result: AgentStreamCompletion) => void | Promise<void>;
};

export class AgentStreamStore {
  private readonly streams = new Map<string, ActiveStream>();

  /** Begin reading immediately; the returned stream is only one observer. */
  start(
    threadId: string,
    inputMessages: unknown[],
    upstream: ReadableStream<Uint8Array>,
    options: AgentStreamStartOptions = {},
  ): ReadableStream<Uint8Array> {
    const existing = this.streams.get(threadId);
    if (existing && !existing.complete) return this.observe(existing);

    const session = this.create(threadId, inputMessages, options);
    void this.pump(threadId, session, upstream);
    return this.observe(session);
  }

  /** Begin a server-owned turn without attaching a transient renderer. */
  startDetached(
    threadId: string,
    inputMessages: unknown[],
    upstream: ReadableStream<Uint8Array>,
    options: AgentStreamStartOptions = {},
  ): void {
    const existing = this.streams.get(threadId);
    if (existing && !existing.complete) return;
    const session = this.create(threadId, inputMessages, options);
    void this.pump(threadId, session, upstream);
  }

  isActive(threadId: string): boolean {
    const session = this.streams.get(threadId);
    return Boolean(session && !session.complete);
  }

  /** Active agent turns, for lightweight local UI observers such as Remix's
   * session list. No stream payload is exposed here. */
  activeThreadIds(): string[] {
    return [...this.streams.entries()]
      .filter(([, session]) => !session.complete)
      .map(([threadId]) => threadId);
  }

  /** Explicit user steering may interrupt the current response. */
  cancel(threadId: string): boolean {
    const session = this.streams.get(threadId);
    if (!session || session.complete) return false;
    session.cancelled = true;
    void session.reader?.cancel().catch(() => {});
    return true;
  }

  private create(
    threadId: string,
    inputMessages: unknown[],
    options: AgentStreamStartOptions,
  ): ActiveStream {
    const session: ActiveStream = {
      inputMessages,
      replay: [],
      subscribers: new Set(),
      reader: null,
      complete: false,
      cancelled: false,
      cleared: false,
      onComplete: options.onComplete,
    };
    this.streams.set(threadId, session);
    agentActivityEvents.publish(threadId);
    return session;
  }

  /** Reattach a UI to an in-flight or just-completed protocol stream. */
  connect(threadId: string): ReadableStream<Uint8Array> | null {
    const session = this.streams.get(threadId);
    return session && !session.complete ? this.observe(session) : null;
  }

  /**
   * The Cloud thread is written after its stream completes. During a handoff,
   * expose the submitted message list so a newly-mounted `useChat` can resume
   * the streamed assistant response against the correct user-message base.
   */
  getActiveMessages(threadId: string): unknown[] | null {
    const session = this.streams.get(threadId);
    return session && !session.complete ? session.inputMessages : null;
  }

  clear(): void {
    const hadStreams = this.streams.size > 0;
    for (const session of this.streams.values()) {
      session.cleared = true;
      this.closeSubscribers(session);
      void session.reader?.cancel().catch(() => {});
    }
    this.streams.clear();
    if (hadStreams) agentActivityEvents.publish();
  }

  private observe(session: ActiveStream): ReadableStream<Uint8Array> {
    let subscriber: ReadableStreamDefaultController<Uint8Array> | null = null;
    return new ReadableStream<Uint8Array>({
      start: (controller) => {
        for (const chunk of session.replay) controller.enqueue(chunk);
        if (session.complete) {
          controller.close();
          return;
        }
        subscriber = controller;
        session.subscribers.add(controller);
      },
      cancel: () => {
        // A renderer can disappear at any time. Do not connect this observer's
        // cancellation to the Cloud reader; other surfaces may still attach.
        if (subscriber) session.subscribers.delete(subscriber);
      },
    });
  }

  private async pump(
    threadId: string,
    session: ActiveStream,
    upstream: ReadableStream<Uint8Array>,
  ): Promise<void> {
    const reader = upstream.getReader();
    session.reader = reader;
    try {
      // A steer can arrive in the small window between creating the local
      // stream entry and obtaining its reader. Honor that cancellation before
      // a single Cloud chunk can reach any observer.
      if (session.cancelled) {
        await reader.cancel();
        return;
      }
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        session.replay.push(value);
        for (const subscriber of session.subscribers) {
          try {
            subscriber.enqueue(value);
          } catch {
            session.subscribers.delete(subscriber);
          }
        }
      }
    } catch {
      // The route that established the stream has already sent a valid stream
      // response. Close observers cleanly rather than leaking a hanging UI.
    } finally {
      session.complete = true;
      session.reader = null;
      this.closeSubscribers(session);
      if (this.streams.get(threadId) === session) this.streams.delete(threadId);
      agentActivityEvents.publish(threadId);
      // A follow-up queue starts only after the previous stream has completely
      // released its slot. Never make the reader await UI work here.
      if (!session.cleared) {
        void session.onComplete?.({
          inputMessages: session.inputMessages,
          cancelled: session.cancelled,
        });
      }
    }
  }

  private closeSubscribers(session: ActiveStream): void {
    for (const subscriber of session.subscribers) {
      try {
        subscriber.close();
      } catch {
        // The HTTP observer may have closed between the last fan-out and the
        // upstream reader's terminal chunk. That never owns the agent run.
      }
    }
    session.subscribers.clear();
  }
}

export const agentStreamStore = new AgentStreamStore();
