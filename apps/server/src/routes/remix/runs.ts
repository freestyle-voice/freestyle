import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod/v3";
import {
  deleteRemixRun,
  getRemixRun,
  listRemixRuns,
  recordRemixRun,
} from "../../lib/remix-store.js";

const recordSchema = z.object({
  threadId: z.number().int().positive().nullish(),
  lane: z.enum(["transform", "agent"]),
  instruction: z.string().min(1).max(4_000),
  beforeText: z.string().max(100_000).nullish(),
  afterText: z.string().min(1).max(100_000),
  appName: z.string().max(200).nullish(),
  llmProvider: z.string().max(100).nullish(),
  llmModel: z.string().max(200).nullish(),
  inputTokens: z.number().int().min(0).optional(),
  outputTokens: z.number().int().min(0).optional(),
  costUsd: z.number().min(0).optional(),
});

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

/**
 * Remix run history: one row per write into the user's document. Powers the
 * Revert affordance (the row keeps the before-text) and the history view.
 */
const runsRoute = new Hono()
  .get("/", zValidator("query", listQuerySchema), (c) => {
    const { limit, offset } = c.req.valid("query");
    return c.json({ runs: listRemixRuns(limit, offset) });
  })
  .post("/", zValidator("json", recordSchema), (c) => {
    const body = c.req.valid("json");
    const id = recordRemixRun({
      threadId: body.threadId ?? null,
      lane: body.lane,
      instruction: body.instruction,
      beforeText: body.beforeText ?? null,
      afterText: body.afterText,
      appName: body.appName ?? null,
      llmProvider: body.llmProvider ?? null,
      llmModel: body.llmModel ?? null,
      inputTokens: body.inputTokens,
      outputTokens: body.outputTokens,
      costUsd: body.costUsd,
    });
    return c.json({ id });
  })
  .get("/:id", (c) => {
    const id = Number(c.req.param("id"));
    const run = Number.isInteger(id) ? getRemixRun(id) : null;
    if (!run) return c.json({ error: "not_found" }, 404);
    return c.json({ run });
  })
  .delete("/:id", (c) => {
    const id = Number(c.req.param("id"));
    if (Number.isInteger(id)) deleteRemixRun(id);
    return c.json({ ok: true });
  });

export default runsRoute;
