import type { MiddlewareHandler } from "hono";
import { z } from "zod";
import { ROUTE_BASE } from "./constants.js";
import type { CommandDraft, CommandStore } from "./store.js";

const actionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("webhook"),
    url: z.string().min(1),
    method: z.enum(["GET", "POST"]).default("POST"),
    headers: z.record(z.string(), z.string()).optional(),
  }),
  z.object({ type: z.literal("openUrl"), url: z.string().min(1) }),
  z.object({ type: z.literal("shell"), command: z.string().min(1) }),
  z.object({ type: z.literal("shortcut"), name: z.string().min(1) }),
]);

const draftSchema = z.object({
  name: z.string().min(1),
  triggers: z.array(z.string().min(1)).min(1),
  description: z.string().default(""),
  action: actionSchema,
  enabled: z.boolean().default(true),
});

/** Result of a dry-run/test detection over a sample utterance. */
export interface TestResult {
  matched: string[];
  fired: boolean;
  command?: string;
  detail?: string;
  llm: boolean;
}

export interface CommandsApiDeps {
  store: CommandStore;
  /** Run the real detection pipeline (prefilter → agent) against sample text. */
  runTest: (text: string) => Promise<TestResult>;
  /** The host OS platform (`process.platform`), surfaced to the UI. */
  platform: NodeJS.Platform;
}

/**
 * Build the Hono middleware exposing the voice-commands CRUD API plus a
 * platform probe and a test runner. Mirrors the profanity-filter plugin: a
 * single handler that owns everything under {@link ROUTE_BASE} and defers to
 * `next()` for anything else.
 */
export function createCommandsApi(deps: CommandsApiDeps): MiddlewareHandler {
  const { store, runTest, platform } = deps;
  const isMac = platform === "darwin";

  return async (c, next) => {
    const path = c.req.path;
    if (!path.startsWith(ROUTE_BASE)) return next();

    const sub = path.slice(ROUTE_BASE.length);
    const method = c.req.method;

    // GET /platform — capability probe for the UI (hides macOS-only options).
    if (sub === "/platform" && method === "GET") {
      return c.json({ platform, isMac });
    }

    // GET /commands — list all commands.
    if (sub === "/commands" && method === "GET") {
      return c.json({ commands: store.list(), platform, isMac });
    }

    // POST /commands — create.
    if (sub === "/commands" && method === "POST") {
      const parsed = await parseDraft(c, isMac);
      if ("error" in parsed) return c.json({ error: parsed.error }, 400);
      const command = await store.create(parsed.draft);
      return c.json({ command }, 201);
    }

    // POST /test — run detection against a sample utterance.
    if (sub === "/test" && method === "POST") {
      const body = await c.req
        .json<{ text?: string }>()
        .catch(() => ({}) as { text?: string });
      const text = (body.text ?? "").trim();
      if (!text) return c.json({ error: "text is required" }, 400);
      return c.json(await runTest(text));
    }

    // /commands/:id — update / delete.
    const idMatch = sub.match(/^\/commands\/([^/]+)$/);
    if (idMatch) {
      const id = decodeURIComponent(idMatch[1]);
      if (method === "PUT") {
        const parsed = await parseDraft(c, isMac);
        if ("error" in parsed) return c.json({ error: parsed.error }, 400);
        const command = await store.update(id, parsed.draft);
        if (!command) return c.json({ error: "command not found" }, 404);
        return c.json({ command });
      }
      if (method === "DELETE") {
        const ok = await store.remove(id);
        if (!ok) return c.json({ error: "command not found" }, 404);
        return c.json({ ok: true });
      }
    }

    return next();
  };
}

/** Parse and validate a command draft from the request body. */
async function parseDraft(
  c: Parameters<MiddlewareHandler>[0],
  isMac: boolean,
): Promise<{ draft: CommandDraft } | { error: string }> {
  const body = await c.req.json().catch(() => null);
  const result = draftSchema.safeParse(body);
  if (!result.success) {
    return { error: result.error.issues[0]?.message ?? "invalid command" };
  }
  if (result.data.action.type === "shortcut" && !isMac) {
    return { error: "Shortcuts are only available on macOS." };
  }
  return { draft: result.data };
}
