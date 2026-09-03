/**
 * Process-local change signal for the small, non-sensitive Remix activity
 * index. The agent stream and queue own the state; this module only tells
 * observers that their current snapshot should be refreshed.
 */
export class AgentActivityEvents {
  private readonly listeners = new Set<(threadId?: string) => void>();

  subscribe(listener: (threadId?: string) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  publish(threadId?: string): void {
    for (const listener of this.listeners) {
      try {
        listener(threadId);
      } catch {
        // A stale HTTP observer must not prevent other windows from seeing a
        // later state change.
      }
    }
  }
}

export const agentActivityEvents = new AgentActivityEvents();
