import type { RemixThreadOrigin } from "./types";

export const remixQueryKeys = {
  all: ["remix"] as const,
  threads: ["remix", "threads"] as const,
  threadList: (origin: RemixThreadOrigin) =>
    ["remix", "threads", "list", origin] as const,
  recentSessions: ["remix", "threads", "recent-sessions"] as const,
  thread: (id: string) => ["remix", "threads", "detail", id] as const,
  latestThread: ["remix", "threads", "latest"] as const,
};
