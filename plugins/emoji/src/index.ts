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
  "PLUGIN OVERRIDE — emoji insertion (this overrides the earlier 'do not add",
  "content words' and 'do not rephrase' rules for emoji only):",
  "The user turned this feature on, so add a few emojis to give the text some",
  "personality — but keep it natural, the way someone casually sprinkles a",
  "couple of emojis into a message. ADD the emoji after the word, phrase, or",
  "sentence it relates to, wherever it reads naturally — do NOT replace the",
  "word (keep the original word and place the emoji after it), and do NOT pile",
  "them all at the very end. Use them sparingly: just a few across the whole",
  "message where they genuinely add something, not one on every line. Skip",
  "them for formal, professional, or technical writing. Never add emojis",
  "inside code, URLs, file paths, or technical identifiers.",
].join(" ");

const SYSTEM_REPLACE = [
  "PLUGIN OVERRIDE — emoji replacement (this overrides the earlier 'do not",
  "add content words' and 'do not rephrase' rules for emoji only):",
  "The user turned this feature on, so swap a few emotionally expressive words",
  "for a single relevant emoji (e.g. 'love' → '❤️', 'happy' → '😊', 'fire' →",
  "'🔥') to give the text some personality — but keep it natural, the way",
  "someone casually uses a couple of emojis. Replace only a few expressive",
  "words across the whole message, not one on every line, and only where it",
  "reads naturally. Skip replacement for formal, professional, or technical",
  "writing. Never replace words inside code, URLs, file paths, or technical",
  "identifiers.",
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
