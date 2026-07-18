import type {
  Plugin,
  PluginLlm,
  PluginOptions,
  PluginStorage,
} from "freestyle-voice";
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
const HISTORY_KEY = "conversation-history";

interface SavedConversation {
  id: string;
  title: string;
  createdAt: number;
  messages: ConversationEntry[];
}

function uid(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

function titleFromMessages(messages: ConversationEntry[]): string {
  const first = messages.find((m) => m.role === "user");
  if (!first) return "Conversation";
  const text = first.content.trim();
  return text.length > 60 ? `${text.slice(0, 57)}...` : text;
}

export default function agentPlugin(_options?: PluginOptions): Plugin {
  let storage: PluginStorage | null = null;
  let config: AgentConfig = { ...DEFAULT_CONFIG };
  let conversation: ConversationEntry[] = [];
  let history: SavedConversation[] = [];
  let logger: (msg: string) => void = () => {};
  let conversationActive = false;
  let lastLlm: PluginLlm | null = null;
  const baseSlug = pluginSlug(PLUGIN_NAME);

  // Turn serialisation: only one agent turn runs at a time.  A second
  // dictation that arrives while the first is still processing is queued
  // behind the running turn's promise.
  let turnChain: Promise<void> = Promise.resolve();

  function ownRoute(reqPath: string, route: string): boolean {
    const m = reqPath.match(new RegExp(`^/api/plugins/([^/]+)${route}$`));
    if (!m) return false;
    return m[1] === baseSlug || m[1] === `${baseSlug}-dev`;
  }

  async function archiveCurrentConversation(): Promise<void> {
    if (conversation.length === 0) return;
    const saved: SavedConversation = {
      id: uid(),
      title: titleFromMessages(conversation),
      createdAt: Date.now(),
      messages: [...conversation],
    };
    history.unshift(saved);
    if (history.length > 50) history = history.slice(0, 50);
    if (storage) await storage.set(HISTORY_KEY, history);
  }

  async function persistConversation(): Promise<void> {
    if (storage) await storage.set(CONVERSATION_KEY, conversation);
  }

  const handler: MiddlewareHandler = async (c, next) => {
    const reqPath = c.req.path;

    if (ownRoute(reqPath, "/agent/config")) {
      if (c.req.method === "GET") return c.json(config);
      if (c.req.method === "PUT") {
        const body = await c.req.json().catch(() => null);
        config = normalizeConfig(body);
        if (storage) await saveConfig(storage, config);
        return c.json(config);
      }
    }

    if (ownRoute(reqPath, "/agent/conversation")) {
      if (c.req.method === "GET") return c.json({ conversation });
      if (c.req.method === "DELETE") {
        conversation = [];
        conversationActive = false;
        await persistConversation();
        return c.json({ ok: true });
      }
    }

    if (ownRoute(reqPath, "/agent/conversations")) {
      if (c.req.method === "GET") return c.json({ conversations: history });
      if (c.req.method === "DELETE") {
        history = [];
        if (storage) await storage.set(HISTORY_KEY, history);
        return c.json({ ok: true });
      }
    }

    const singleDelete = reqPath.match(
      new RegExp(
        `^/api/plugins/(?:${baseSlug}|${baseSlug}-dev)/agent/conversations/([^/]+)$`,
      ),
    );
    if (singleDelete && c.req.method === "DELETE") {
      history = history.filter((h) => h.id !== singleDelete[1]);
      if (storage) await storage.set(HISTORY_KEY, history);
      return c.json({ ok: true });
    }

    if (ownRoute(reqPath, "/agent/regenerate") && c.req.method === "POST") {
      if (!lastLlm) {
        return c.json({ error: "No model available" }, 503);
      }
      if (
        conversation.length > 0 &&
        conversation[conversation.length - 1].role === "assistant"
      ) {
        conversation.pop();
      }
      if (conversation.length === 0) {
        return c.json({ error: "Nothing to regenerate" }, 400);
      }
      try {
        const reply = await runAgentTurn({
          llm: lastLlm,
          config,
          history: conversation,
          log: logger,
        });
        conversation.push({ role: "assistant", content: reply });
        await persistConversation();
        return c.json({ reply });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return c.json({ error: msg }, 500);
      }
    }

    if (ownRoute(reqPath, "/agent/session/end") && c.req.method === "POST") {
      // Mark inactive immediately.  Archival is deferred to the next fresh
      // trigger — this avoids archiving an incomplete conversation if the
      // agent turn is still running when the panel closes.
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
      const storedHistory =
        await ctx.storage.get<SavedConversation[]>(HISTORY_KEY);
      if (Array.isArray(storedHistory)) history = storedHistory;
      ctx.logger.info(`voice agent ready on ${ctx.mode}`);
    },

    async afterCleanup(_input, output, api) {
      if (api.llm) lastLlm = api.llm;

      const text = output.text.trim();
      if (!text) return;

      const matcher = buildAgentNameRegex(config.agentName);
      const hasName = matcher.test(text);

      if (!conversationActive && !hasName) return;

      const prompt = hasName ? stripAgentName(text, matcher) : text;
      if (!prompt) return;

      // Consume the output IMMEDIATELY so the text is never pasted,
      // regardless of how long the LLM call takes or whether the user
      // closes the panel during processing.
      output.text = prompt;
      api.control.consume("voice-agent: handled in the pill panel");

      // Serialise agent turns — a follow-up dictation waits for the
      // previous turn to finish before running.
      const previousTurn = turnChain;
      let resolveThisTurn: () => void;
      turnChain = new Promise<void>((r) => {
        resolveThisTurn = r;
      });

      try {
        await previousTurn;

        if (!conversationActive) {
          await archiveCurrentConversation();
          conversation = [];
          conversationActive = true;
        }
        conversation.push({ role: "user", content: prompt });

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

        // Guard: if the session was ended while the turn was running (user
        // closed the panel), don't push the reply — the conversation has
        // already been marked for archival on the next trigger.
        if (conversationActive) {
          conversation.push({ role: "assistant", content: reply });
          await persistConversation();
        }
      } finally {
        resolveThisTurn!();
      }
    },
  };
}
