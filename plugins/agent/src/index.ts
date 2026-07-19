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
  type StoredToolCall,
  saveConfig,
} from "./config.js";
import type { ToolCallEvent, ToolCallStartEvent } from "./mcp/index.js";
import { BUILTIN_TOOL_COUNT } from "./mcp/index.js";
import { createMcpMiddleware } from "./mcp/server.js";
import type { GuidanceEvent } from "./mcp/tools/desktop.js";
import { connectMcpServer } from "./mcp.js";
import {
  clearOAuthData,
  hasOAuthTokens,
  pendingOAuthTransports,
} from "./oauth.js";

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

/**
 * Convert an MCP UI widget action into a concise synthetic user prompt so the
 * agent can continue the turn. Handles the mcp-ui action shapes: `tool`,
 * `prompt`, `intent`, `link`, `notify`.
 */
function widgetActionToPrompt(action: {
  type?: string;
  payload?: Record<string, unknown>;
}): string | null {
  const { type, payload = {} } = action;
  switch (type) {
    case "prompt": {
      const p = payload.prompt;
      return typeof p === "string" && p.trim() ? p.trim() : null;
    }
    case "tool": {
      const toolName = payload.toolName ?? payload.tool;
      const params = payload.params ?? payload.arguments ?? {};
      return `The user interacted with the widget and chose to run "${String(
        toolName,
      )}" with parameters ${JSON.stringify(params)}. Continue accordingly.`;
    }
    case "intent": {
      const intent = payload.intent;
      const params = payload.params ?? {};
      return `The user triggered the "${String(
        intent,
      )}" intent from the widget with ${JSON.stringify(
        params,
      )}. Continue accordingly.`;
    }
    case "link": {
      const url = payload.url;
      return typeof url === "string"
        ? `Open this link for the user: ${url}`
        : null;
    }
    default:
      // notify / unknown — nothing actionable for the agent.
      return null;
  }
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

      // Collect tool calls made during this turn so they persist with the
      // assistant message (rendered inline, in order, like ChatGPT/Claude).
      const turnToolCalls: StoredToolCall[] = [];

      let reply: string;
      if (llm) {
        try {
          reply = await runAgentTurn({
            llm,
            config,
            history: conversation,
            signal,
            log: logger,
            storage: storage ?? undefined,
            pluginSlug: baseSlug,
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
            onToolCall: (e: ToolCallEvent) => {
              turnToolCalls.push({
                callId: e.callId,
                tool: e.tool,
                input: e.input,
                output: e.output,
                isError: e.isError,
                ...(e.uiResource ? { uiResource: e.uiResource } : {}),
              });
              emit(
                {
                  type: "toolCall",
                  callId: e.callId,
                  tool: e.tool,
                  input: e.input,
                  output: e.output,
                  isError: e.isError,
                  ...(e.uiResource ? { uiResource: e.uiResource } : {}),
                },
                pipelineEmit,
              );
            },
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
        conversation.push({
          role: "assistant",
          content: reply,
          ...(turnToolCalls.length > 0 ? { toolCalls: turnToolCalls } : {}),
        });
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
        const regenToolCalls: StoredToolCall[] = [];
        const reply = await runAgentTurn({
          llm: lastLlm,
          config,
          history: conversation,
          log: logger,
          storage: storage ?? undefined,
          pluginSlug: baseSlug,
          onToolCall: (e) => {
            regenToolCalls.push({
              callId: e.callId,
              tool: e.tool,
              input: e.input,
              output: e.output,
              isError: e.isError,
              ...(e.uiResource ? { uiResource: e.uiResource } : {}),
            });
          },
        });
        conversation.push({
          role: "assistant",
          content: reply,
          ...(regenToolCalls.length > 0 ? { toolCalls: regenToolCalls } : {}),
        });
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

    // Widget action from an MCP UI resource — the user interacted with a
    // rendered widget (tool/prompt/intent/link). Translate it into a follow-up
    // agent turn so the conversation continues naturally.
    if (ownRoute(reqPath, "/agent/widget-action") && c.req.method === "POST") {
      const body = (await c.req.json().catch(() => null)) as {
        type?: string;
        payload?: Record<string, unknown>;
      } | null;
      if (!body) return c.json({ error: "Invalid body" }, 400);

      const prompt = widgetActionToPrompt(body);
      if (!prompt) return c.json({ ok: true, ignored: true });

      if (!lastLlm) {
        return c.json({ error: "No model available" }, 503);
      }
      // Fire-and-forget: SSE streams the resulting turn to the panel.
      void executeAgentTurn(prompt, lastLlm, undefined, undefined);
      return c.json({ ok: true });
    }

    if (ownRoute(reqPath, "/agent/builtin-tools") && c.req.method === "GET") {
      return c.json({
        enabled: config.builtinToolsEnabled,
        count: BUILTIN_TOOL_COUNT,
      });
    }

    // ---- OAuth routes ----

    // Trigger the OAuth authorization flow for an HTTP MCP server.
    if (ownRoute(reqPath, "/agent/oauth/connect") && c.req.method === "POST") {
      const serverId = c.req.query("server_id");
      if (!serverId) return c.json({ error: "Missing server_id" }, 400);

      const server = config.mcpServers.find((s) => s.id === serverId);
      if (!server) return c.json({ error: "Server not found" }, 404);
      if (server.auth !== "oauth")
        return c.json({ error: "Server is not configured for OAuth" }, 400);

      if (storage && (await hasOAuthTokens(serverId, storage))) {
        return c.json({ status: "authorized" });
      }

      try {
        await connectMcpServer(server, {
          storage: storage ?? undefined,
          pluginSlug: baseSlug,
        });
        return c.json({ status: "authorized" });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("OAuth authorization required")) {
          return c.json({ status: "redirecting" });
        }
        return c.json({ status: "error", message: msg }, 500);
      }
    }

    // OAuth callback — the browser redirects here after the user authorizes.
    if (ownRoute(reqPath, "/agent/oauth/callback") && c.req.method === "GET") {
      const code = c.req.query("code");
      if (!code) {
        const error = c.req.query("error") ?? "unknown";
        const desc = c.req.query("error_description") ?? "";
        return c.html(
          `<!DOCTYPE html><html><body><h3>Authorization failed</h3><p>${error}: ${desc}</p><p>You can close this tab.</p></body></html>`,
          400,
        );
      }

      // Find the pending transport. There should only be one at a time in
      // practice (single user), but we try to match by checking each.
      let finished = false;
      for (const [serverId, transport] of pendingOAuthTransports) {
        try {
          await transport.finishAuth(code);
          pendingOAuthTransports.delete(serverId);
          finished = true;
          break;
        } catch {
          // This transport didn't match — try next.
        }
      }

      if (finished) {
        return c.html(
          `<!DOCTYPE html><html><body style="font-family:system-ui;text-align:center;padding:60px 20px"><h3>Authorization complete</h3><p>You can close this tab and return to Freestyle.</p></body></html>`,
        );
      }
      return c.html(
        `<!DOCTYPE html><html><body><h3>Authorization failed</h3><p>No pending OAuth flow found. Try again from Settings.</p></body></html>`,
        400,
      );
    }

    // Check OAuth authorization status for a server.
    if (ownRoute(reqPath, "/agent/oauth/status") && c.req.method === "GET") {
      const serverId = c.req.query("server_id");
      if (!serverId) return c.json({ error: "Missing server_id" }, 400);
      const authorized = storage
        ? await hasOAuthTokens(serverId, storage)
        : false;
      return c.json({ authorized });
    }

    // Revoke OAuth authorization for a server.
    if (ownRoute(reqPath, "/agent/oauth/revoke") && c.req.method === "DELETE") {
      const serverId = c.req.query("server_id");
      if (!serverId) return c.json({ error: "Missing server_id" }, 400);
      if (storage) await clearOAuthData(serverId, storage);
      return c.json({ ok: true });
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
