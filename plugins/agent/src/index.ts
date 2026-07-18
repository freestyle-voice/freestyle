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

  // Turn serialisation: only one agent turn runs at a time.
  let turnChain: Promise<void> = Promise.resolve();

  // afterTranscribe stashes the prompt extracted from the RAW text (before
  // LLM cleanup can strip the name).  afterCleanup picks it up.
  const pendingPrompts = new WeakMap<object, string>();

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

  /** Run the agent turn, serialised with other turns. Fire-and-forget safe. */
  async function executeAgentTurn(
    prompt: string,
    llm: PluginLlm | undefined,
    signal: AbortSignal | undefined,
    emitStream:
      | ((event: import("freestyle-voice").PluginStreamEvent) => void)
      | undefined,
  ): Promise<void> {
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

      emitStream?.({ type: "streamStart" });

      let reply: string;
      if (llm) {
        try {
          reply = await runAgentTurn({
            llm,
            config,
            history: conversation,
            signal,
            log: logger,
            onDelta: (delta) =>
              emitStream?.({ type: "streamDelta", text: delta }),
          });
        } catch (err) {
          reply = `Sorry, the agent turn failed: ${
            err instanceof Error ? err.message : String(err)
          }`;
          emitStream?.({ type: "streamDelta", text: reply });
        }
      } else {
        reply =
          "No language model is configured. Set one under Settings → Models.";
        emitStream?.({ type: "streamDelta", text: reply });
      }

      emitStream?.({ type: "streamEnd" });

      if (conversationActive) {
        conversation.push({ role: "assistant", content: reply });
        await persistConversation();
      }
    } finally {
      resolveThisTurn!();
    }
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

    afterTranscribe(_input, output, api) {
      const text = output.text.trim();
      if (!text) return;

      const matcher = buildAgentNameRegex(config.agentName);
      const hasName = matcher.test(text);
      if (!hasName && !conversationActive) return;

      const prompt = hasName ? stripAgentName(text, matcher) : text;
      if (!prompt) return;

      pendingPrompts.set(api, prompt);
    },

    async afterCleanup(_input, output, api) {
      if (api.llm) lastLlm = api.llm;

      // Check the stash from afterTranscribe (name detected in raw text).
      let prompt = pendingPrompts.get(api) ?? null;
      pendingPrompts.delete(api);

      // Fallback: match in the cleaned text (Freestyle Cloud streaming path
      // where afterTranscribe doesn't fire, or when cleanup preserved the name).
      if (!prompt) {
        const text = output.text.trim();
        if (!text) return;

        const matcher = buildAgentNameRegex(config.agentName);
        const hasName = matcher.test(text);

        if (!conversationActive && !hasName) return;

        prompt = hasName ? stripAgentName(text, matcher) : text;
        if (!prompt) return;
      }

      // Consume IMMEDIATELY so the text is never pasted.
      output.text = prompt;
      api.control.consume("voice-agent: handled in the pill panel");

      // If the streaming path is available (WebSocket), the agent turn runs
      // inline so stream events (start/delta/end) reach the panel live.
      // Otherwise (batch path), fire-and-forget: the panel polls for the
      // completed conversation via GET /agent/conversation.
      if (api.emitStream) {
        await executeAgentTurn(prompt, api.llm, api.signal, api.emitStream);
      } else {
        void executeAgentTurn(prompt, api.llm, api.signal, undefined);
      }
    },
  };
}
