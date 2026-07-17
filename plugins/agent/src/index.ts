import type { Plugin, PluginOptions, PluginStorage } from "freestyle-voice";
import { pluginSlug } from "freestyle-voice";
import type { MiddlewareHandler } from "hono";
import { runAgentTurn } from "./agent.js";
import {
  type AgentConfig,
  type ConversationEntry,
  DEFAULT_CONFIG,
  loadConfig,
  normalizeConfig,
  saveConfig,
} from "./config.js";
import { buildWakeWordRegex, stripWakeWord } from "./wake-word.js";

const PLUGIN_NAME = "@freestyle-voice/plugin-agent";
const CONVERSATION_KEY = "conversation";

export default function agentPlugin(_options?: PluginOptions): Plugin {
  let storage: PluginStorage | null = null;
  let config: AgentConfig = { ...DEFAULT_CONFIG };
  let conversation: ConversationEntry[] = [];
  let logger: (msg: string) => void = () => {};
  const baseSlug = pluginSlug(PLUGIN_NAME);

  function ownRoute(reqPath: string, route: string): boolean {
    const m = reqPath.match(new RegExp(`^/api/plugins/([^/]+)${route}$`));
    if (!m) return false;
    return m[1] === baseSlug || m[1] === `${baseSlug}-dev`;
  }

  const handler: MiddlewareHandler = async (c, next) => {
    const reqPath = c.req.path;

    // Config CRUD — the settings page reads and writes here.
    if (ownRoute(reqPath, "/agent/config")) {
      if (c.req.method === "GET") return c.json(config);
      if (c.req.method === "PUT") {
        const body = await c.req.json().catch(() => null);
        config = normalizeConfig(body);
        if (storage) await saveConfig(storage, config);
        return c.json(config);
      }
    }

    // Conversation — the pill panel reads and clears it.
    if (ownRoute(reqPath, "/agent/conversation")) {
      if (c.req.method === "GET") return c.json({ conversation });
      if (c.req.method === "DELETE") {
        conversation = [];
        if (storage) await storage.set(CONVERSATION_KEY, conversation);
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
      logger = (msg) => ctx.logger.info(msg);
      config = await loadConfig(ctx.storage);
      const stored =
        await ctx.storage.get<ConversationEntry[]>(CONVERSATION_KEY);
      if (Array.isArray(stored)) conversation = stored;
      ctx.logger.info(`voice agent ready on ${ctx.mode}`);
    },

    // Intercept in `afterCleanup`, not `afterTranscribe`: `afterCleanup` is the
    // one hook that fires on every path — batch, local streaming, AND Freestyle
    // Cloud streaming with combined cleanup (where `afterTranscribe` is skipped
    // because there's no separable raw transcript). This is what lets the agent
    // work for cloud users. The wake word survives cleanup since it leads the
    // utterance, and cleanup preserves leading content.
    async afterCleanup(_input, output, api) {
      const text = output.text.trim();
      if (!text) return;

      // Only intercept dictation that opens with the configured wake word
      // (default "hey freestyle"). Everything else is dictated normally.
      const wake = buildWakeWordRegex(config.wakeWord);
      if (!wake.test(text)) return;

      const prompt = stripWakeWord(text, wake);
      if (!prompt) return;

      conversation.push({ role: "user", content: prompt });

      let reply: string;
      if (api.llm) {
        try {
          reply = await runAgentTurn({
            llm: api.llm,
            config,
            history: conversation,
            signal: api.signal,
            log: logger,
          });
        } catch (err) {
          reply = `Sorry, the agent turn failed: ${
            err instanceof Error ? err.message : String(err)
          }`;
        }
      } else {
        reply =
          "No language model is configured. Set one under Settings → Models.";
      }

      conversation.push({ role: "assistant", content: reply });
      if (storage) await storage.set(CONVERSATION_KEY, conversation);

      // Hand the utterance to the pill panel instead of pasting it.
      output.text = prompt;
      api.control.consume("voice-agent: handled in the pill panel");
    },
  };
}
