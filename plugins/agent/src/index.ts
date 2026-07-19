import type {
  Plugin,
  PluginLlm,
  PluginOptions,
  PluginStorage,
  PluginStreamEvent,
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
import type { ToolCallEvent, ToolCallStartEvent } from "./mcp/index.js";
import { BUILTIN_TOOL_COUNT } from "./mcp/index.js";
import { createMcpMiddleware } from "./mcp/server.js";
import type { GuidanceEvent } from "./mcp/tools/desktop.js";

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

  let turnChain: Promise<void> = Promise.resolve();
  const pendingPrompts = new WeakMap<object, string>();

  // SSE clients — the panel connects via EventSource to receive live events.
  const sseClients = new Set<ReadableStreamDefaultController<Uint8Array>>();
  const encoder = new TextEncoder();

  function broadcastSSE(event: Record<string, unknown>): void {
    const data = `data: ${JSON.stringify(event)}\n\n`;
    const bytes = encoder.encode(data);
    for (const ctrl of sseClients) {
      try {
        ctrl.enqueue(bytes);
      } catch {
        sseClients.delete(ctrl);
      }
    }
  }

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

  /** Emit an event to all channels: the pipeline WS (if available) + SSE. */
  function emit(
    event: Record<string, unknown>,
    pipelineEmit?: (event: PluginStreamEvent) => void,
  ): void {
    // Only forward known stream events to the pipeline WS bridge.
    const t = event.type;
    if (
      pipelineEmit &&
      (t === "streamStart" || t === "streamDelta" || t === "streamEnd")
    ) {
      pipelineEmit(event as unknown as PluginStreamEvent);
    }
    broadcastSSE(event);
  }

  async function executeAgentTurn(
    prompt: string,
    llm: PluginLlm | undefined,
    signal: AbortSignal | undefined,
    pipelineEmit: ((event: PluginStreamEvent) => void) | undefined,
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

      emit({ type: "streamStart" }, pipelineEmit);

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
              emit({ type: "streamDelta", text: delta }, pipelineEmit),
            onToolCallStart: (e: ToolCallStartEvent) =>
              emit(
                {
                  type: "toolCallStart",
                  callId: e.callId,
                  tool: e.tool,
                  input: e.input,
                },
                pipelineEmit,
              ),
            onToolCall: (e: ToolCallEvent) =>
              emit(
                {
                  type: "toolCall",
                  callId: e.callId,
                  tool: e.tool,
                  input: e.input,
                  output: e.output,
                  isError: e.isError,
                },
                pipelineEmit,
              ),
            onGuidance: (e: GuidanceEvent) =>
              emit({ type: "guidance", ...e }, pipelineEmit),
          });
        } catch (err) {
          reply = `Sorry, the agent turn failed: ${
            err instanceof Error ? err.message : String(err)
          }`;
          emit({ type: "streamDelta", text: reply }, pipelineEmit);
        }
      } else {
        reply =
          "No language model is configured. Set one under Settings → Models.";
        emit({ type: "streamDelta", text: reply }, pipelineEmit);
      }

      emit({ type: "streamEnd" }, pipelineEmit);

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

    if (ownRoute(reqPath, "/agent/builtin-tools") && c.req.method === "GET") {
      return c.json({
        enabled: config.builtinToolsEnabled,
        count: BUILTIN_TOOL_COUNT,
      });
    }

    // SSE endpoint — the panel connects here for live agent events.
    if (ownRoute(reqPath, "/agent/stream") && c.req.method === "GET") {
      let ctrl: ReadableStreamDefaultController<Uint8Array>;
      const stream = new ReadableStream<Uint8Array>({
        start(c) {
          ctrl = c;
          sseClients.add(ctrl);
        },
        cancel() {
          sseClients.delete(ctrl);
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    return next();
  };

  // MCP middleware — serves built-in tools over Streamable HTTP transport at
  // /api/plugins/<slug>/mcp so external MCP clients can connect.
  const mcpHandler = createMcpMiddleware((reqPath) => {
    const m = reqPath.match(
      new RegExp(`^/api/plugins/(?:${baseSlug}|${baseSlug}-dev)/mcp(?:/|$)`),
    );
    return !!m;
  });

  return {
    name: PLUGIN_NAME,
    middleware: [handler, mcpHandler],

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

      let prompt = pendingPrompts.get(api) ?? null;
      pendingPrompts.delete(api);

      if (!prompt) {
        const text = output.text.trim();
        if (!text) return;

        const matcher = buildAgentNameRegex(config.agentName);
        const hasName = matcher.test(text);

        if (!conversationActive && !hasName) return;

        prompt = hasName ? stripAgentName(text, matcher) : text;
        if (!prompt) return;
      }

      output.text = prompt;
      api.control.consume("voice-agent: handled in the pill panel");

      // Always fire-and-forget — the turn runs in the background.  On the WS
      // streaming path, events also go through api.emitStream (which pipes to
      // the renderer → IPC → panel).  On the batch path, events only go to
      // SSE clients (the panel's EventSource connection).
      void executeAgentTurn(prompt, api.llm, api.signal, api.emitStream);
    },
  };
}
