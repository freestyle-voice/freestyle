import type { Plugin, PluginOptions } from "freestyle-voice";
import type { MiddlewareHandler } from "hono";
import {
  buildMatchers,
  clean,
  DEFAULT_REPLACEMENTS,
  type ReplacementMap,
} from "./replacements.js";

const REPLACEMENTS_ROUTE =
  "/api/plugins/freestyle-voice-profanity-filter/replacements";

interface ProfanityOptions {
  replacements?: Record<string, string | string[]>;
  disableDefaults?: boolean;
  preserveCase?: boolean;
}

function toAltList(value: string | string[]): string[] {
  const list = Array.isArray(value) ? value : [value];
  return list.filter((entry) => typeof entry === "string" && entry.trim());
}

function normalizeMap(raw: Record<string, string | string[]>): ReplacementMap {
  const out: ReplacementMap = {};
  for (const [key, value] of Object.entries(raw)) {
    const normalizedKey = key.trim().toLowerCase();
    const alts = toAltList(value);
    if (normalizedKey && alts.length > 0) out[normalizedKey] = alts;
  }
  return out;
}

export default function profanityFilter(options?: PluginOptions): Plugin {
  const opts = (options ?? {}) as ProfanityOptions;
  const preserveCase = opts.preserveCase !== false;
  const custom =
    opts.replacements && typeof opts.replacements === "object"
      ? normalizeMap(opts.replacements)
      : {};

  const map: ReplacementMap = {
    ...(opts.disableDefaults ? {} : DEFAULT_REPLACEMENTS),
    ...custom,
  };
  const matchers = buildMatchers(map);

  const entries = Object.entries(map)
    .map(([word, alternatives]) => ({ word, alternatives }))
    .sort((a, b) => b.word.split(/\s+/).length - a.word.split(/\s+/).length);

  const replacementsApi: MiddlewareHandler = async (c, next) => {
    if (c.req.path !== REPLACEMENTS_ROUTE) return next();
    return c.json({
      preserveCase,
      count: entries.length,
      replacements: entries,
    });
  };

  return {
    name: "@freestyle-voice/profanity-filter",
    middleware: [replacementsApi],

    setup({ logger, mode }) {
      logger.info(
        `profanity-filter ready on ${mode} (${matchers.length} substitutions)`,
      );
    },

    afterCleanup(_input, output) {
      output.text = clean(output.text, matchers, preserveCase);
    },
  };
}
