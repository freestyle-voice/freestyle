import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod/v3";
import {
  getActiveThread,
  getThreadMessages,
  type StoredUiMessage,
  saveThreadMessages,
  startNewThread,
} from "../../lib/remix-store.js";

const syncSchema = z.object({
  threadId: z.number().int().positive(),
  messages: z.array(z.unknown()).max(80),
});

/**
 * Thread state for the pill's chat card. GET hands back the thread new
 * messages should join (creating one if the last went idle); /sync snapshots
 * the renderer's copy of the messages after each turn; /new is the explicit
 * new-thread affordance.
 */
const threadRoute = new Hono()
  .get("/", (c) => {
    const { thread, resumed } = getActiveThread();
    return c.json({
      threadId: thread.id,
      resumed,
      messages: getThreadMessages(thread.id),
    });
  })
  .post("/sync", zValidator("json", syncSchema), (c) => {
    const { threadId, messages } = c.req.valid("json");
    saveThreadMessages(threadId, messages as StoredUiMessage[]);
    return c.json({ ok: true });
  })
  .post("/new", (c) => {
    const thread = startNewThread();
    return c.json({ threadId: thread.id, resumed: false, messages: [] });
  });

export default threadRoute;
