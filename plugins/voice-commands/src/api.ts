import type { PluginLogger } from "freestyle-voice";
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

export interface CommandsApiDeps {
  store: CommandStore;
  /** The host OS platform (`process.platform`), surfaced to the UI. */
  platform: NodeJS.Platform;
  /**
   * Resolve the current plugin logger. A getter (not the logger itself) because
   * the API is built when the plugin factory runs, before `setup` has handed us
   * the real logger — the getter closes over the mutable reference.
   */
  getLogger: () => PluginLogger;
}

/**
 * Build the Hono middleware exposing the voice-commands CRUD API plus a
 * platform probe and a test runner. Mirrors the profanity-filter plugin: a
 * single handler that owns everything under {@link ROUTE_BASE} and defers to
 * `next()` for anything else.
 */
export function createCommandsApi(deps: CommandsApiDeps): MiddlewareHandler {
  const { store, platform, getLogger } = deps;
  const isMac = platform === "darwin";

  return async (c, next) => {
    const path = c.req.path;
    if (!path.startsWith(ROUTE_BASE)) return next();

    const sub = path.slice(ROUTE_BASE.length);
    const method = c.req.method;
    const log = getLogger();
    log.debug(`api ${method} ${sub || "/"}`);

    try {
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
        log.info(`created command "${command.name}" (${command.id})`);
        return c.json({ command }, 201);
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
          log.info(`updated command "${command.name}" (${id})`);
          return c.json({ command });
        }
        if (method === "DELETE") {
          const ok = await store.remove(id);
          if (!ok) return c.json({ error: "command not found" }, 404);
          log.info(`deleted command ${id}`);
          return c.json({ ok: true });
        }
      }

      return next();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error(`api ${method} ${sub || "/"} failed: ${message}`);
      if (err instanceof Error && err.stack) log.debug(err.stack);
      return c.json({ error: message }, 500);
    }
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
