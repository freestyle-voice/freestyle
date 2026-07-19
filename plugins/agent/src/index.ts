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
  type AssistantPart,
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

/**
 * Escape a string for safe interpolation into HTML text/attribute content.
 * The OAuth callback echoes query params (error, error_description) and
 * server error messages into an HTML page; without escaping these are a
 * reflected-XSS vector.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function titleFromMessages(messages: ConversationEntry[]): string {
  const first = messages.find((m) => m.role === "user");
  if (!first) return "Conversation";
  const text = first.content.trim();
  return text.length > 60 ? `${text.slice(0, 57)}...` : text;
}

/**
 * Builds an assistant turn as ordered text/tool parts. Text deltas coalesce
 * into the current text part; a tool call closes the current text part and
 * appends a tool part, so the persisted `parts` mirror the real
 * text→tool→text interleaving of the stream.
 */
function createPartAccumulator(): {
  addText: (delta: string) => void;
  addTool: (tool: StoredToolCall) => void;
  finish: (fallbackText?: string) => AssistantPart[];
  toolCalls: () => StoredToolCall[];
} {
  const parts: AssistantPart[] = [];
  const tools: StoredToolCall[] = [];
  let buffer = "";
  let sawText = false;

  const flushText = (): void => {
    if (buffer) {
      parts.push({ type: "text", text: buffer });
      buffer = "";
    }
  };

  return {
    addText: (delta) => {
      if (delta) sawText = true;
      buffer += delta;
    },
    addTool: (tool) => {
      flushText();
      tools.push(tool);
      parts.push({ type: "tool", tool });
    },
    // `fallbackText` covers a tools-only turn: the model streamed no text, so
    // `runAgentTurn` returns a synthetic message. Without this the persisted
    // `parts` would carry only tool parts and the message text (kept in
    // `content`) would never render, since renderers prefer `parts`.
    finish: (fallbackText) => {
      flushText();
      if (!sawText && fallbackText) {
        parts.push({ type: "text", text: fallbackText });
      }
      return parts;
    },
    toolCalls: () => tools,
  };
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
  /** ID of the current conversation's entry in `history` (null = none yet). */
  let currentId: string | null = null;
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

  /** Persist the whole history list. */
  async function saveHistory(): Promise<void> {
    if (storage) await storage.set(HISTORY_KEY, history);
  }

  /**
   * Persist the current conversation into `history` in place. The active
   * conversation is a first-class entry from its first message, so it survives
   * an app quit mid-conversation and always appears in the Conversations list.
   */
  async function persistConversation(): Promise<void> {
    if (conversation.length === 0) return;

    if (!currentId) {
      currentId = uid();
      history.unshift({
        id: currentId,
        title: titleFromMessages(conversation),
        createdAt: Date.now(),
        messages: [...conversation],
      });
      if (history.length > 50) history = history.slice(0, 50);
    } else {
      const existing = history.find((h) => h.id === currentId);
      if (existing) {
        existing.messages = [...conversation];
        existing.title = titleFromMessages(conversation);
      } else {
        // Entry was trimmed/deleted — re-add it at the top.
        history.unshift({
          id: currentId,
          title: titleFromMessages(conversation),
          createdAt: Date.now(),
          messages: [...conversation],
        });
        if (history.length > 50) history = history.slice(0, 50);
      }
    }
    await saveHistory();
  }

  /** End the current conversation so the next prompt starts a fresh one. */
  function endConversation(): void {
    conversationActive = false;
    conversation = [];
    currentId = null;
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

  /**
   * Serialize a unit of work against the single conversation state. All turns
   * (voice-triggered, widget-action, regenerate) mutate the shared
   * `conversation` array, so they must run one at a time to avoid interleaved
   * pushes corrupting the thread.
   */
  async function serializeTurn<T>(work: () => Promise<T>): Promise<T> {
    const previousTurn = turnChain;
    let resolveThisTurn: () => void;
    turnChain = new Promise<void>((r) => {
      resolveThisTurn = r;
    });
    try {
      await previousTurn;
      return await work();
    } finally {
      resolveThisTurn!();
    }
  }

  async function executeAgentTurn(
    prompt: string,
    llm: PluginLlm | undefined,
    signal: AbortSignal | undefined,
    pipelineEmit: ((event: PluginStreamEvent) => void) | undefined,
  ): Promise<void> {
    await serializeTurn(async () => {
      if (!conversationActive) {
        // Start a fresh conversation (new entry in history on first persist).
        conversation = [];
        currentId = null;
        conversationActive = true;
      }
      conversation.push({ role: "user", content: prompt });
      // Persist immediately so the conversation survives a mid-turn quit.
      await persistConversation();

      emit({ type: "streamStart" }, pipelineEmit);

      // Accumulate the turn as ordered parts so the real text→tool→text
      // interleaving is preserved (rendered inline, in order, like
      // ChatGPT/Claude). `turnToolCalls` is kept for the legacy field.
      const acc = createPartAccumulator();

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
            onDelta: (delta) => {
              acc.addText(delta);
              emit({ type: "streamDelta", text: delta }, pipelineEmit);
            },
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
              acc.addTool({
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
          acc.addText(reply);
          emit({ type: "streamDelta", text: reply }, pipelineEmit);
        }
      } else {
        reply =
          "No language model is configured. Set one under Settings → Models.";
        acc.addText(reply);
        emit({ type: "streamDelta", text: reply }, pipelineEmit);
      }

      emit({ type: "streamEnd" }, pipelineEmit);

      if (conversationActive) {
        const parts = acc.finish(reply);
        const turnToolCalls = acc.toolCalls();
        conversation.push({
          role: "assistant",
          content: reply,
          ...(turnToolCalls.length > 0 ? { toolCalls: turnToolCalls } : {}),
          ...(parts.length > 0 ? { parts } : {}),
        });
        await persistConversation();
      }
    });
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
        // Just end the session — the conversation stays in history. The next
        // prompt starts a fresh one.
        endConversation();
        return c.json({ ok: true });
      }
    }

    if (ownRoute(reqPath, "/agent/conversations")) {
      if (c.req.method === "GET") return c.json({ conversations: history });
      if (c.req.method === "DELETE") {
        history = [];
        endConversation();
        await saveHistory();
        return c.json({ ok: true });
      }
    }

    const singleDelete = reqPath.match(
      new RegExp(
        `^/api/plugins/(?:${baseSlug}|${baseSlug}-dev)/agent/conversations/([^/]+)$`,
      ),
    );
    if (singleDelete && c.req.method === "DELETE") {
      const id = singleDelete[1];
      history = history.filter((h) => h.id !== id);
      // If the active conversation was deleted, end the session.
      if (id === currentId) endConversation();
      await saveHistory();
      return c.json({ ok: true });
    }

    if (ownRoute(reqPath, "/agent/regenerate") && c.req.method === "POST") {
      const regenLlm = lastLlm;
      if (!regenLlm) {
        return c.json({ error: "No model available" }, 503);
      }
      // Serialize against in-flight turns: regenerate mutates the shared
      // `conversation` array, so it must not interleave with a voice- or
      // widget-triggered turn.
      const result = await serializeTurn(
        async (): Promise<
          | { ok: true; reply: string }
          | { ok: false; status: 400 | 500; error: string }
        > => {
          if (
            conversation.length > 0 &&
            conversation[conversation.length - 1].role === "assistant"
          ) {
            conversation.pop();
          }
          if (conversation.length === 0) {
            return { ok: false, status: 400, error: "Nothing to regenerate" };
          }
          try {
            const acc = createPartAccumulator();
            // Emit the same stream events as a normal turn so the pill panel
            // shows its thinking/streaming state during regeneration.
            emit({ type: "streamStart" });
            const reply = await runAgentTurn({
              llm: regenLlm,
              config,
              history: conversation,
              log: logger,
              storage: storage ?? undefined,
              pluginSlug: baseSlug,
              onDelta: (delta) => {
                acc.addText(delta);
                emit({ type: "streamDelta", text: delta });
              },
              onToolCallStart: (e) =>
                emit({
                  type: "toolCallStart",
                  callId: e.callId,
                  tool: e.tool,
                  input: e.input,
                }),
              onToolCall: (e) => {
                acc.addTool({
                  callId: e.callId,
                  tool: e.tool,
                  input: e.input,
                  output: e.output,
                  isError: e.isError,
                  ...(e.uiResource ? { uiResource: e.uiResource } : {}),
                });
                emit({
                  type: "toolCall",
                  callId: e.callId,
                  tool: e.tool,
                  input: e.input,
                  output: e.output,
                  isError: e.isError,
                  ...(e.uiResource ? { uiResource: e.uiResource } : {}),
                });
              },
            });
            const parts = acc.finish(reply);
            const regenToolCalls = acc.toolCalls();
            conversation.push({
              role: "assistant",
              content: reply,
              ...(regenToolCalls.length > 0
                ? { toolCalls: regenToolCalls }
                : {}),
              ...(parts.length > 0 ? { parts } : {}),
            });
            await persistConversation();
            emit({ type: "streamEnd" });
            return { ok: true, reply };
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            emit({ type: "streamEnd" });
            return { ok: false, status: 500, error: msg };
          }
        },
      );
      return result.ok
        ? c.json({ reply: result.reply })
        : c.json({ error: result.error }, result.status);
    }

    if (ownRoute(reqPath, "/agent/session/end") && c.req.method === "POST") {
      endConversation();
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
      // The widget belongs to the current conversation — keep it active so the
      // action continues the same thread rather than archiving/starting a new
      // one.
      if (conversation.length > 0) conversationActive = true;
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
    // The trailing path segment is the server id, so multiple OAuth MCP
    // servers each route their code to the correct pending transport.
    const oauthCallback = reqPath.match(
      new RegExp(
        `^/api/plugins/(?:${baseSlug}|${baseSlug}-dev)/agent/oauth/callback/([^/]+)$`,
      ),
    );
    if (oauthCallback && c.req.method === "GET") {
      const serverId = decodeURIComponent(oauthCallback[1]);
      const code = c.req.query("code");
      if (!code) {
        const error = c.req.query("error") ?? "unknown";
        const desc = c.req.query("error_description") ?? "";
        return c.html(
          `<!DOCTYPE html><html><body><h3>Authorization failed</h3><p>${escapeHtml(error)}: ${escapeHtml(desc)}</p><p>You can close this tab.</p></body></html>`,
          400,
        );
      }

      const transport = pendingOAuthTransports.get(serverId);
      if (!transport) {
        return c.html(
          `<!DOCTYPE html><html><body><h3>Authorization failed</h3><p>No pending OAuth flow for this server. Try again from Settings.</p></body></html>`,
          400,
        );
      }

      try {
        await transport.finishAuth(code);
        pendingOAuthTransports.delete(serverId);
        return c.html(
          `<!DOCTYPE html><html><body style="font-family:system-ui;text-align:center;padding:60px 20px"><h3>Authorization complete</h3><p>You can close this tab and return to Freestyle.</p></body></html>`,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return c.html(
          `<!DOCTYPE html><html><body><h3>Authorization failed</h3><p>${escapeHtml(msg)}</p></body></html>`,
          400,
        );
      }
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

      const storedHistory =
        await ctx.storage.get<SavedConversation[]>(HISTORY_KEY);
      if (Array.isArray(storedHistory)) history = storedHistory;

      // One-time migration: older builds kept the active conversation in a
      // separate key. Fold it into history so it isn't lost.
      const legacy =
        await ctx.storage.get<ConversationEntry[]>(CONVERSATION_KEY);
      if (Array.isArray(legacy) && legacy.length > 0) {
        history.unshift({
          id: uid(),
          title: titleFromMessages(legacy),
          createdAt: Date.now(),
          messages: legacy,
        });
        await saveHistory();
        await ctx.storage.delete(CONVERSATION_KEY);
      }

      // The app restarted — no conversation is active. The last one lives in
      // history and is viewable; a new prompt starts a fresh thread.
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
