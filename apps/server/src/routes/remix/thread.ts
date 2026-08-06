import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod/v3";
import {
  getActiveThread,
  getThread,
  getThreadMessages,
  listThreads,
  MAX_THREAD_MESSAGES,
  type StoredUiMessage,
  saveThreadMessages,
  startNewThread,
} from "../../lib/remix-store.js";

const syncSchema = z.object({
  threadId: z.number().int().positive(),
  messages: z.array(z.unknown()).max(MAX_THREAD_MESSAGES),
});

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
  offset: z.coerce.number().int().min(0).default(0),
});

/**
 * Thread state for the pill's chat card. GET reports the thread new messages
 * should join — a null threadId when the last one went idle, without creating
 * anything (GET must not mutate); /sync snapshots the renderer's copy of the
 * messages after each turn; /new is the explicit new-thread affordance;
 * /list and /:id back the conversation-history view.
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
  .get("/list", zValidator("query", listQuerySchema), (c) => {
    const { limit, offset } = c.req.valid("query");
    return c.json({ threads: listThreads(limit, offset) });
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
  })
  .get("/:id", (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id) || id <= 0) {
      return c.json({ error: "not_found" }, 404);
    }
    const found = getThread(id);
    if (!found) {
      return c.json({ error: "not_found" }, 404);
    }
    return c.json({
      threadId: found.thread.id,
      resumed: true,
      messages: found.messages,
    });
  });

export default threadRoute;
