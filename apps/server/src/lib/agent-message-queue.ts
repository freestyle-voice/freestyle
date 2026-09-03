/**
 * A small local queue for follow-up Remix messages.
 *
 * The local Hono server owns this state so a pill-to-workspace handoff does
 * not lose a message that was typed while the current agent response was
 * streaming. Queue entries intentionally live only for this server process:
 * once they are sent, Cloud persists them in the canonical thread.
 */
import { agentActivityEvents } from "./agent-activity-events.js";

export type AgentQueuedMessage = {
  id: string;
  text: string;
  createdAt: number;
  /** Fresh selection context is useful for pill follow-ups when available. */
  context?: unknown;
};

type ThreadQueue = {
  items: AgentQueuedMessage[];
  draining: boolean;
};

export class AgentMessageQueue {
  private readonly queues = new Map<string, ThreadQueue>();

  list(threadId: string): AgentQueuedMessage[] {
    return [...(this.get(threadId, false)?.items ?? [])];
  }

  /** Thread ids with one or more follow-ups still waiting locally. */
  threadIds(): string[] {
    return [...this.queues.entries()]
      .filter(([, queue]) => queue.items.length > 0)
      .map(([threadId]) => threadId);
  }

  enqueue(
    threadId: string,
    input: Omit<AgentQueuedMessage, "id" | "createdAt">,
  ): AgentQueuedMessage {
    const item: AgentQueuedMessage = {
      id: crypto.randomUUID(),
      text: input.text,
      createdAt: Date.now(),
      ...(input.context === undefined ? {} : { context: input.context }),
    };
    this.get(threadId, true)!.items.push(item);
    agentActivityEvents.publish(threadId);
    return item;
  }

  update(
    threadId: string,
    id: string,
    text: string,
  ): AgentQueuedMessage | null {
    const item = this.get(threadId, false)?.items.find(
      (entry) => entry.id === id,
    );
    if (!item) return null;
    item.text = text;
    agentActivityEvents.publish(threadId);
    return item;
  }

  remove(threadId: string, id: string): AgentQueuedMessage | null {
    const queue = this.get(threadId, false);
    if (!queue) return null;
    const index = queue.items.findIndex((entry) => entry.id === id);
    if (index < 0) return null;
    const [item] = queue.items.splice(index, 1);
    this.cleanup(threadId, queue);
    agentActivityEvents.publish(threadId);
    return item ?? null;
  }

  /** Move a queued entry to the next slot without duplicating it. */
  prioritize(threadId: string, id: string): AgentQueuedMessage | null {
    const queue = this.get(threadId, false);
    if (!queue) return null;
    const index = queue.items.findIndex((entry) => entry.id === id);
    if (index < 0) return null;
    const [item] = queue.items.splice(index, 1);
    if (!item) return null;
    queue.items.unshift(item);
    agentActivityEvents.publish(threadId);
    return item;
  }

  /**
   * Run one entry at a time. The handler resolves only when Cloud accepted a
   * new stream; a failure keeps the item visible and retryable in the UI.
   */
  async drain(
    threadId: string,
    start: (item: AgentQueuedMessage) => Promise<void>,
  ): Promise<void> {
    const queue = this.get(threadId, false);
    if (!queue || queue.draining || queue.items.length === 0) return;
    queue.draining = true;
    try {
      const next = queue.items[0];
      if (!next) return;
      await start(next);
      if (queue.items[0]?.id === next.id) queue.items.shift();
    } finally {
      queue.draining = false;
      this.cleanup(threadId, queue);
      agentActivityEvents.publish(threadId);
    }
  }

  clear(): void {
    const hadQueues = this.queues.size > 0;
    this.queues.clear();
    if (hadQueues) agentActivityEvents.publish();
  }

  private get(threadId: string, create: boolean): ThreadQueue | undefined {
    const existing = this.queues.get(threadId);
    if (existing || !create) return existing;
    const queue: ThreadQueue = { items: [], draining: false };
    this.queues.set(threadId, queue);
    return queue;
  }

  private cleanup(threadId: string, queue: ThreadQueue): void {
    if (!queue.draining && queue.items.length === 0)
      this.queues.delete(threadId);
  }
}

export const agentMessageQueue = new AgentMessageQueue();
