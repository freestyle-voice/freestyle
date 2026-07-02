import type { Plugin, PluginOptions, PluginStorage } from "freestyle-voice";
import type { MiddlewareHandler } from "hono";
import {
  buildMatchers,
  clean,
  DEFAULT_REPLACEMENTS,
  type ReplacementMap,
} from "./replacements.js";

const ROUTE_BASE = "/api/plugins/freestyle-voice-profanity-filter/replacements";

interface ProfanityOptions {
  preserveCase?: boolean;
}

function toAltList(value: string | string[]): string[] {
  const list = Array.isArray(value) ? value : [value];
  return list.filter((entry) => typeof entry === "string" && entry.trim());
}

function normalizeWord(word: string): string {
  return word.trim().toLowerCase();
}

/** Serialise the current map into sorted entries for the API response. */
function toEntries(map: ReplacementMap) {
  return Object.entries(map)
    .map(([word, alternatives]) => ({ word, alternatives }))
    .sort((a, b) => b.word.split(/\s+/).length - a.word.split(/\s+/).length);
}

const STORAGE_KEY = "replacements";

export default function profanityFilter(options?: PluginOptions): Plugin {
  const opts = (options ?? {}) as ProfanityOptions;
  const preserveCase = opts.preserveCase !== false;

  // Mutable state — seeded in setup(), mutated by CRUD routes.
  let map: ReplacementMap = {};
  let matchers = buildMatchers(map);
  let storage: PluginStorage | null = null;

  /** Rebuild matchers after any map mutation and persist to storage. */
  async function persist(): Promise<void> {
    matchers = buildMatchers(map);
    if (storage) await storage.set(STORAGE_KEY, map);
  }

  // -- Middleware: routes --------------------------------------------------

  const handler: MiddlewareHandler = async (c, next) => {
    const path = c.req.path;
    if (!path.startsWith(ROUTE_BASE)) return next();

    const sub = path.slice(ROUTE_BASE.length);
    const method = c.req.method;

    // GET /replacements — list all
    if ((!sub || sub === "/") && method === "GET") {
      return c.json({
        preserveCase,
        count: Object.keys(map).length,
        replacements: toEntries(map),
      });
    }

    // POST /replacements — add a word { word, alternatives }
    if ((!sub || sub === "/") && method === "POST") {
      const body = await c.req.json<{
        word?: string;
        alternatives?: string | string[];
      }>();
      const word = normalizeWord(body.word ?? "");
      if (!word) return c.json({ error: "word is required" }, 400);
      const alts = toAltList(body.alternatives ?? []);
      if (alts.length === 0)
        return c.json({ error: "at least one alternative is required" }, 400);
      if (map[word])
        return c.json(
          { error: "word already exists — use PUT to update" },
          409,
        );
      map[word] = alts;
      await persist();
      return c.json({ ok: true, word, alternatives: alts }, 201);
    }

    // PUT /replacements — update a word { word, alternatives }
    if ((!sub || sub === "/") && method === "PUT") {
      const body = await c.req.json<{
        word?: string;
        alternatives?: string | string[];
      }>();
      const word = normalizeWord(body.word ?? "");
      if (!word) return c.json({ error: "word is required" }, 400);
      const alts = toAltList(body.alternatives ?? []);
      if (alts.length === 0)
        return c.json({ error: "at least one alternative is required" }, 400);
      map[word] = alts;
      await persist();
      return c.json({ ok: true, word, alternatives: alts });
    }

    // DELETE /replacements — remove a word { word }
    if ((!sub || sub === "/") && method === "DELETE") {
      const body = await c.req.json<{ word?: string }>();
      const word = normalizeWord(body.word ?? "");
      if (!word) return c.json({ error: "word is required" }, 400);
      if (!map[word]) return c.json({ error: "word not found" }, 404);
      delete map[word];
      await persist();
      return c.json({ ok: true });
    }

    // POST /replacements/reset — restore defaults
    if (sub === "/reset" && method === "POST") {
      map = { ...DEFAULT_REPLACEMENTS };
      await persist();
      return c.json({
        ok: true,
        count: Object.keys(map).length,
        replacements: toEntries(map),
      });
    }

    return next();
  };

  return {
    name: "@freestyle-voice/profanity-filter",
    middleware: [handler],

    async setup(ctx) {
      storage = ctx.storage;

      // Seed from storage, or initialise with defaults on first run.
      const stored = await storage.get<ReplacementMap>(STORAGE_KEY);
      if (stored && typeof stored === "object" && !Array.isArray(stored)) {
        map = stored;
      } else {
        map = { ...DEFAULT_REPLACEMENTS };
        await storage.set(STORAGE_KEY, map);
      }
      matchers = buildMatchers(map);

      ctx.logger.info(
        `profanity-filter ready on ${ctx.mode} (${matchers.length} substitutions)`,
      );
    },

    afterCleanup(_input, output) {
      output.text = clean(output.text, matchers, preserveCase);
    },
  };
}
