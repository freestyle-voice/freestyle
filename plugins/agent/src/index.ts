import type { Plugin, PluginOptions, PluginStorage } from "freestyle-voice";
import { pluginSlug } from "freestyle-voice";
import type { MiddlewareHandler } from "hono";
import { runAgentTurn } from "./agent.js";
import { buildAgentNameRegex, stripAgentName } from "./agent-name.js";
import {
  type AgentConfig,
  type ConversationEntry,
  DEFAULT_CONFIG,
  loadConfig,
  normalizeConfig,
  saveConfig,
} from "./config.js";

const PLUGIN_NAME = "@freestyle-voice/plugin-agent";
const CONVERSATION_KEY = "conversation";

export default function agentPlugin(_options?: PluginOptions): Plugin {
  let storage: PluginStorage | null = null;
  let config: AgentConfig = { ...DEFAULT_CONFIG };
  let conversation: ConversationEntry[] = [];
  let logger: (msg: string) => void = () => {};
  // Whether the current conversation is "live" (its panel is open). A trigger
  // that arrives when it's NOT active starts a fresh conversation; one that
  // arrives while active continues the thread. The host marks it inactive when
  // the panel closes (POST /agent/session/end).
  let conversationActive = false;
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
        conversationActive = false;
        if (storage) await storage.set(CONVERSATION_KEY, conversation);
        return c.json({ ok: true });
      }
    }

    // The panel closed — end the session so the next trigger starts fresh.
    // The conversation itself is kept (viewable on the settings page) until the
    // next trigger clears it or the user clears it explicitly.
    if (ownRoute(reqPath, "/agent/session/end") && c.req.method === "POST") {
      conversationActive = false;
      return c.json({ ok: true });
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
    // work for cloud users. The agent name survives cleanup since it leads the
    // utterance, and cleanup preserves leading content.
    async afterCleanup(_input, output, api) {
      const text = output.text.trim();
      if (!text) return;

      // When a conversation is already live (the panel is open), every
      // subsequent dictation is a follow-up — route it to the agent without
      // requiring the name again. When the panel is closed, only intercept
      // dictation that opens with the agent's name (default "Freestyle").
      const matcher = buildAgentNameRegex(config.agentName);
      const hasName = matcher.test(text);

      if (!conversationActive && !hasName) return;

      const prompt = hasName ? stripAgentName(text, matcher) : text;
      if (!prompt) return;

      // A fresh trigger (panel closed → named) starts a new thread; a
      // follow-up (panel open) continues the existing one.
      if (!conversationActive) {
        conversation = [];
        conversationActive = true;
      }
      conversation.push({ role: "user", content: prompt });

      // Signal the panel to open now and begin an assistant message. Do this
      // before the LLM call so the pill appears immediately, then streams.
      api.emitStream?.({ type: "streamStart" });

      let reply: string;
      if (api.llm) {
        try {
          reply = await runAgentTurn({
            llm: api.llm,
            config,
            history: conversation,
            signal: api.signal,
            log: logger,
            onDelta: (delta) =>
              api.emitStream?.({ type: "streamDelta", text: delta }),
          });
        } catch (err) {
          reply = `Sorry, the agent turn failed: ${
            err instanceof Error ? err.message : String(err)
          }`;
          api.emitStream?.({ type: "streamDelta", text: reply });
        }
      } else {
        reply =
          "No language model is configured. Set one under Settings → Models.";
        api.emitStream?.({ type: "streamDelta", text: reply });
      }

      api.emitStream?.({ type: "streamEnd" });

      conversation.push({ role: "assistant", content: reply });
      if (storage) await storage.set(CONVERSATION_KEY, conversation);

      // Hand the utterance to the pill panel instead of pasting it.
      output.text = prompt;
      api.control.consume("voice-agent: handled in the pill panel");
    },
  };
}
