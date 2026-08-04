import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod/v3";
import {
  getActiveThread,
  getThreadMessages,
  MAX_THREAD_MESSAGES,
  type StoredUiMessage,
  saveThreadMessages,
  startNewThread,
} from "../../lib/remix-store.js";

const syncSchema = z.object({
  threadId: z.number().int().positive(),
  messages: z.array(z.unknown()).max(MAX_THREAD_MESSAGES),
});

/**
 * Thread state for the pill's chat card. GET reports the thread new messages
 * should join — a null threadId when the last one went idle, without creating
 * anything (GET must not mutate); /sync snapshots the renderer's copy of the
 * messages after each turn; /new is the explicit new-thread affordance.
 */
const threadRoute = new Hono()
  .get("/", (c) => {
    const thread = getActiveThread();
    if (!thread) {
      return c.json({ threadId: null, resumed: false, messages: [] });
    }
    return c.json({
      threadId: thread.id,
      resumed: true,
      messages: getThreadMessages(thread.id),
    });
  })
  .post("/sync", zValidator("json", syncSchema), (c) => {
    const { threadId, messages } = c.req.valid("json");
    if (!saveThreadMessages(threadId, messages as StoredUiMessage[])) {
      return c.json({ error: "not_found" }, 404);
    }
    return c.json({ ok: true });
  })
  .post("/new", (c) => {
    const thread = startNewThread();
    return c.json({ threadId: thread.id, resumed: false, messages: [] });
  });

export default threadRoute;
