import { createAppLogger } from "@freestyle-voice/utils";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import { readSetting } from "../../lib/db.js";
import {
  CLAUDE_AGENT_OAUTH_TOKEN_SETTING,
  detectAmbientClaudeLogin,
  getClaudeAgentAuth,
  getRemixEngine,
  testClaudeAgent,
} from "../../lib/remix-agent-claude.js";
import {
  resolveToolCall,
  subscribeToolChannel,
  toolChannelConnected,
} from "../../lib/remix-agent-tool-bridge.js";
import { getSessionToken } from "../../lib/sessions.js";

const log = createAppLogger("remix-claude-agent");

const toolResultSchema = z.object({
  id: z.string().min(1),
  output: z.record(z.string(), z.unknown()),
});

const claudeAgentRouter = new Hono()
  .get("/status", (c) => {
    return c.json({
      engine: getRemixEngine(),
      auth: getClaudeAgentAuth(),
      ambientClaudeLogin: detectAmbientClaudeLogin(),
      oauthTokenConfigured: Boolean(
        readSetting(CLAUDE_AGENT_OAUTH_TOKEN_SETTING)?.trim(),
      ),
      cloudSignedIn: Boolean(getSessionToken()),
      toolChannelConnected: toolChannelConnected(),
    });
  })
  .post("/test", async (c) => {
    const result = await testClaudeAgent();
    return c.json(result, result.ok ? 200 : 502);
  })
  .get("/tools/channel", (c) => {
    return streamSSE(c, async (stream) => {
      log.info("Tool channel connected");
      let done: () => void = () => {};
      const closed = new Promise<void>((resolve) => {
        done = resolve;
      });
      const unsubscribe = subscribeToolChannel((event) => {
        void stream.writeSSE({
          event: "tool-call",
          data: JSON.stringify(event),
        });
      });
      stream.onAbort(() => {
        unsubscribe();
        log.info("Tool channel disconnected");
        done();
      });
      const heartbeat = setInterval(() => {
        void stream.writeSSE({ event: "ping", data: "" });
      }, 25_000);
      await closed;
      clearInterval(heartbeat);
    });
  })
  .post("/tools/result", zValidator("json", toolResultSchema), (c) => {
    const { id, output } = c.req.valid("json");
    const accepted = resolveToolCall(id, output);
    return c.json({ ok: accepted });
  });

export default claudeAgentRouter;
