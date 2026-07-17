import type { Plugin, PluginOptions, PluginStorage } from "freestyle-voice";
import { pluginSlug } from "freestyle-voice";
import type { MiddlewareHandler } from "hono";

const PLUGIN_NAME = "@freestyle-voice/plugin-agent";
const STORAGE_KEY = "conversation";
const DEFAULT_SYSTEM_PROMPT =
  "You are a helpful voice assistant. Respond concisely.";

interface ConversationEntry {
  role: "user" | "assistant";
  content: string;
}

export default function agentPlugin(_options?: PluginOptions): Plugin {
  let storage: PluginStorage | null = null;
  let systemPrompt = DEFAULT_SYSTEM_PROMPT;
  let conversation: ConversationEntry[] = [];
  const baseSlug = pluginSlug(PLUGIN_NAME);

  function isPluginRoute(reqPath: string, route: string): boolean {
    const m = reqPath.match(new RegExp(`^/api/plugins/([^/]+)${route}$`));
    if (!m) return false;
    const slug = m[1];
    return slug === baseSlug || slug === `${baseSlug}-dev`;
  }

  const handler: MiddlewareHandler = async (c, next) => {
    const reqPath = c.req.path;

    if (isPluginRoute(reqPath, "/agent/conversation")) {
      if (c.req.method === "GET") {
        return c.json({ conversation, systemPrompt });
      }
      if (c.req.method === "DELETE") {
        conversation = [];
        if (storage) await storage.set(STORAGE_KEY, conversation);
        return c.json({ ok: true });
      }
    }

    return next();
  };

  return {
    name: PLUGIN_NAME,
    middleware: [handler],

    async setup(ctx) {
      storage = ctx.storage;

      const stored = await storage.get<ConversationEntry[]>(STORAGE_KEY);
      if (Array.isArray(stored)) {
        conversation = stored;
      }

      const customPrompt = await ctx.settings.getOwn("system_prompt");
      if (typeof customPrompt === "string" && customPrompt.trim()) {
        systemPrompt = customPrompt;
      }

      ctx.logger.info(`agent plugin ready on ${ctx.mode}`);
    },

    async afterTranscribe(input, output, api) {
      const text = output.text.trim();
      if (!text) return;

      // Match a leading "agent" wake word followed by any punctuation or
      // whitespace — speech-to-text rarely produces the literal "agent:" a
      // user "says"; it's usually "Agent, …", "Agent. …", or just "Agent …".
      const wakeWord = /^\s*(hey\s+|ok\s+)?agent\b[\s,.:;!?-]*/i;
      const hasWakeWord = wakeWord.test(text);

      const appName = input.appContext?.appName?.toLowerCase() ?? "";
      const isDevApp =
        appName.includes("terminal") ||
        appName.includes("code") ||
        appName.includes("iterm") ||
        appName.includes("warp");

      if (!hasWakeWord && !isDevApp) return;

      // Strip the wake word when present; in a dev app the whole utterance is
      // the prompt.
      const cleanText = hasWakeWord ? text.replace(wakeWord, "").trim() : text;
      if (!cleanText) return;
      conversation.push({ role: "user", content: cleanText });

      if (api.llm) {
        const prompt = conversation
          .map((e) => `${e.role}: ${e.content}`)
          .join("\n");

        const result = await api.llm.generateText({
          system: systemPrompt,
          prompt,
        });

        conversation.push({ role: "assistant", content: result.text });
      } else {
        conversation.push({
          role: "assistant",
          content: "LLM not available. Configure a model in Settings > Models.",
        });
      }

      if (storage) await storage.set(STORAGE_KEY, conversation);

      output.text = cleanText;
      api.control.consume("agent-plugin: intercepted for agent turn");
    },
  };
}
