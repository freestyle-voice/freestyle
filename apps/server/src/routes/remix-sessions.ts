import {
  MCP_TOOLS_MAX,
  REMIX_CLIENT_TOOLS,
  remixAgentRequestSchema,
} from "@freestyle-voice/validations";
import { zValidator } from "@hono/zod-validator";
import {
  convertToModelMessages,
  type FlexibleSchema,
  stepCountIs,
  streamText,
  tool,
  type UIMessage,
} from "ai";
import { Hono } from "hono";
import { z } from "zod";
import { buildRemixAgentSystem } from "../lib/editor/remix-prompts.js";
import { createMcpStore } from "../lib/mcp/store.js";
import { createCleanupModel } from "../lib/providers.js";
import { getRemixRuntime } from "../lib/remix-runtime.js";
import {
  createRemixThread,
  deleteLocalRemixThread,
  getRemixThread,
  getThreadMessages,
  listLocalRemixThreads,
  saveThreadMessages,
  updateRemixThreadTitle,
} from "../lib/remix-store.js";
import { getSession } from "../lib/sessions.js";

const threadIdSchema = z.string().uuid();
const storedMessageSchema = z.object({ id: z.string().min(1) }).passthrough();
const MAX_LOCAL_REMIX_STEPS = 16;

function createLocalRemixTools() {
  const clientTools = Object.fromEntries(
    Object.entries(REMIX_CLIENT_TOOLS).map(([name, definition]) => [
      name,
      tool({
        description: definition.description,
        inputSchema: definition.inputSchema as FlexibleSchema<
          Record<string, unknown>
        >,
      }),
    ]),
  );
  const mcpTools = Object.fromEntries(
    createMcpStore()
      .listEnabledTools()
      .slice(0, MCP_TOOLS_MAX)
      .filter(({ tool: definition }) => !(definition.wireName in clientTools))
      .map(({ tool: definition }) => [
        definition.wireName,
        tool({
          description: definition.description,
          inputSchema: definition.inputSchema as FlexibleSchema<
            Record<string, unknown>
          >,
        }),
      ]),
  );
  return { ...clientTools, ...mcpTools };
}

function localThreadPayload(threadId: string) {
  const thread = getRemixThread(threadId);
  if (!thread || thread.type !== "local") return null;
  return { ...thread, messages: getThreadMessages(thread.id) };
}

/**
 * The renderer gets session ownership from this boundary rather than deriving
 * it from a selected model. This keeps model changes from reclassifying an
 * existing conversation and ensures only local sessions can read SQLite bodies.
 */
const remixSessionsRoute = new Hono()
  .post("/", (c) => {
    const runtime = getRemixRuntime();
    const session = runtime.kind === "managed" ? getSession() : null;
    if (runtime.kind === "managed" && !session)
      return c.json({ error: "cloud_auth_required" }, 401);
    const thread = createRemixThread(
      runtime.kind === "local" ? "local" : "remote",
      runtime.kind === "local"
        ? {
            provider: runtime.model.provider,
            modelId: runtime.model.model_id,
            modelName: runtime.model.model_name,
          }
        : null,
      session ? `${session.host}:${session.user.id}` : null,
    );
    return c.json({ thread: { ...thread, messages: [] } }, 201);
  })
  .get("/local", (c) => c.json({ threads: listLocalRemixThreads() }))
  .post(
    "/:id/stream",
    zValidator("param", z.object({ id: threadIdSchema })),
    zValidator("json", remixAgentRequestSchema),
    async (c) => {
      const thread = getRemixThread(c.req.valid("param").id);
      if (!thread || thread.type !== "local" || !thread.model)
        return c.json({ error: "local_thread_not_found" }, 404);
      try {
        const model = await createCleanupModel(
          thread.model.provider,
          thread.model.modelId,
        );
        const request = c.req.valid("json");
        const result = streamText({
          model,
          system: buildRemixAgentSystem(request.context, {
            hasWebSearch: false,
          }),
          messages: await convertToModelMessages(
            request.messages as UIMessage[],
          ),
          tools: createLocalRemixTools(),
          stopWhen: stepCountIs(MAX_LOCAL_REMIX_STEPS),
          maxRetries: 0,
          abortSignal: c.req.raw.signal,
        });
        return result.toUIMessageStreamResponse({
          originalMessages: request.messages as UIMessage[],
          generateMessageId: () => crypto.randomUUID(),
          onError: () => "Remix could not complete this request.",
        });
      } catch {
        return c.json({ error: "remix_unavailable" }, 502);
      }
    },
  )
  .get("/:id", zValidator("param", z.object({ id: threadIdSchema })), (c) => {
    const thread = localThreadPayload(c.req.valid("param").id);
    if (!thread) return c.json({ error: "thread_not_found" }, 404);
    return c.json({ thread });
  })
  .put(
    "/:id/messages",
    zValidator("param", z.object({ id: threadIdSchema })),
    zValidator(
      "json",
      z.object({ messages: z.array(storedMessageSchema).max(40) }),
    ),
    (c) => {
      const { id } = c.req.valid("param");
      if (!saveThreadMessages(id, c.req.valid("json").messages))
        return c.json({ error: "thread_not_found" }, 404);
      return c.json({ ok: true });
    },
  )
  .patch(
    "/:id",
    zValidator("param", z.object({ id: threadIdSchema })),
    zValidator(
      "json",
      z.object({ title: z.string().trim().max(200).nullable() }),
    ),
    (c) => {
      const { id } = c.req.valid("param");
      if (!updateRemixThreadTitle(id, c.req.valid("json").title))
        return c.json({ error: "thread_not_found" }, 404);
      return c.json({ ok: true });
    },
  )
  .delete(
    "/:id",
    zValidator("param", z.object({ id: threadIdSchema })),
    (c) => {
      if (!deleteLocalRemixThread(c.req.valid("param").id))
        return c.json({ error: "thread_not_found" }, 404);
      return c.json({ ok: true });
    },
  );

export default remixSessionsRoute;
