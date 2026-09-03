import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { getDb } from "../lib/db.js";
import { subscribeSyncEvents } from "../lib/sync-events.js";
import { cachedSyncScope } from "../lib/sync-scope.js";
import { LocalSyncStore } from "../lib/sync-store.js";

const sync = new Hono()
  .get("/status", (c) => {
    const scope = cachedSyncScope();
    return c.json({
      scope,
      ...(scope
        ? new LocalSyncStore(getDb()).getStatus(scope)
        : { pending: 0, failed: 0 }),
    });
  })
  .get("/events", (c) =>
    streamSSE(c, async (stream) => {
      const unsubscribe = subscribeSyncEvents((event) => {
        void stream.writeSSE({ event: "sync", data: JSON.stringify(event) });
      });
      try {
        await new Promise<void>((resolve) => {
          c.req.raw.signal.addEventListener("abort", () => resolve(), {
            once: true,
          });
        });
      } finally {
        unsubscribe();
      }
    }),
  );

export default sync;
