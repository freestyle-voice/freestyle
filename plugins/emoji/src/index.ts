import {
  type Plugin,
  type PluginOptions,
  type PluginStorage,
  pluginSlug,
} from "freestyle-voice";
import type { MiddlewareHandler } from "hono";

type PlacementMode = "after" | "replace";

const STORAGE_KEY = "settings";

interface EmojiSettings {
  placement: PlacementMode;
}

const DEFAULT_SETTINGS: EmojiSettings = {
  placement: "after",
};

function isValidPlacement(value: unknown): value is PlacementMode {
  return value === "after" || value === "replace";
}

const SYSTEM_AFTER = [
  "Where the tone feels casual, friendly, or conversational, add a relevant",
  "emoji after the word or phrase it relates to. Do not add emojis to formal,",
  "professional, or technical text. Use emojis sparingly — at most 2–3 per",
  "paragraph. Never add emojis to code, URLs, file paths, or technical",
  "identifiers. If the text is entirely formal or professional, do not add any",
  "emojis at all.",
].join(" ");

const SYSTEM_REPLACE = [
  "Where the tone feels casual, friendly, or conversational, replace",
  "emotionally expressive words with a single relevant emoji (e.g. 'love' →",
  "'❤️', 'happy' → '😊'). Do not replace words in formal, professional, or",
  "technical text. Replace sparingly — at most 2–3 per paragraph. Never",
  "replace words in code, URLs, file paths, or technical identifiers. If the",
  "text is entirely formal or professional, do not replace any words.",
].join(" ");

export default function emojiPlugin(_options?: PluginOptions): Plugin {
  const pluginName = "@freestyle-voice/plugin-emoji";
  const baseSlug = pluginSlug(pluginName);
  let settings: EmojiSettings = { ...DEFAULT_SETTINGS };
  let storage: PluginStorage | null = null;

  async function persist(): Promise<void> {
    if (storage) await storage.set(STORAGE_KEY, settings);
  }

  /**
   * Check whether a request path targets this plugin's settings route. Matches
   * both the production slug (`freestyle-voice-plugin-emoji`) and the dev-linked
   * slug (`freestyle-voice-plugin-emoji-dev`).
   */
  function isSettingsRoute(reqPath: string): boolean {
    const m = reqPath.match(/^\/api\/plugins\/([^/]+)\/settings$/);
    if (!m) return false;
    const slug = m[1];
    return slug === baseSlug || slug === `${baseSlug}-dev`;
  }

  // -- Middleware: settings routes -------------------------------------------

  const handler: MiddlewareHandler = async (c, next) => {
    if (!isSettingsRoute(c.req.path)) return next();

    const method = c.req.method;

    // GET /settings — return current settings
    if (method === "GET") {
      return c.json(settings);
    }

    // PUT /settings — update settings
    if (method === "PUT") {
      const body = await c.req.json<{ placement?: unknown }>();
      if (!isValidPlacement(body.placement)) {
        return c.json({ error: 'placement must be "after" or "replace"' }, 400);
      }
      settings.placement = body.placement;
      await persist();
      return c.json(settings);
    }

    return next();
  };

  return {
    name: pluginName,
    middleware: [handler],

    async setup(ctx) {
      storage = ctx.storage;

      const stored = await storage.get<EmojiSettings>(STORAGE_KEY);
      if (
        stored &&
        typeof stored === "object" &&
        !Array.isArray(stored) &&
        isValidPlacement(stored.placement)
      ) {
        settings = stored;
      } else {
        settings = { ...DEFAULT_SETTINGS };
        await storage.set(STORAGE_KEY, settings);
      }

      ctx.logger.info(
        `emoji plugin ready on ${ctx.mode} (placement: ${settings.placement})`,
      );
    },

    beforeCleanup(_input, output) {
      output.system.push(
        settings.placement === "replace" ? SYSTEM_REPLACE : SYSTEM_AFTER,
      );
    },
  };
}
