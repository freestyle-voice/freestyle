import { existsSync, readFileSync } from "node:fs";
import { createAppLogger } from "@freestyle-voice/utils";
import {
  type ClaudeAgentAuth,
  type ClaudeAgentModel,
  claudeAgentAuthSchema,
  claudeAgentModelSchema,
  DEFAULT_CLAUDE_AGENT_AUTH,
  DEFAULT_CLAUDE_AGENT_MODEL,
  DEFAULT_REMIX_ENGINE,
  REMIX_CLIENT_TOOLS,
  type RemixAgentRequest,
  type RemixEngine,
  remixEngineSchema,
} from "@freestyle-voice/validations";
import {
  convertToModelMessages,
  generateText,
  streamText,
  type UIMessage,
} from "ai";
import {
  type ClaudeCodeSettings,
  createAiSdkMcpServer,
  createClaudeCode,
} from "ai-sdk-provider-claude-code";
import { readSetting } from "./db.js";
import { buildRemixAgentSystem } from "./editor/remix-prompts.js";
import { freestyleCloudUrl } from "./freestyle-cloud.js";
import { capture } from "./posthog.js";
import { requestClientTool } from "./remix-agent-tool-bridge.js";
import { getSessionToken } from "./sessions.js";

const log = createAppLogger("remix-agent-claude");

export const REMIX_ENGINE_SETTING = "remix_engine";
export const CLAUDE_AGENT_AUTH_SETTING = "claude_agent_auth";
export const CLAUDE_AGENT_MODEL_SETTING = "claude_agent_model";
export const CLAUDE_AGENT_OAUTH_TOKEN_SETTING = "claude_agent_oauth_token";
export const CLAUDE_AGENT_FULL_ACCESS_SETTING = "claude_agent_full_access";

const CLAUDE_AGENT_MAX_TURNS = 50;

export function getRemixEngine(): RemixEngine {
  const parsed = remixEngineSchema.safeParse(readSetting(REMIX_ENGINE_SETTING));
  return parsed.success ? parsed.data : DEFAULT_REMIX_ENGINE;
}

export function getClaudeAgentAuth(): ClaudeAgentAuth {
  const parsed = claudeAgentAuthSchema.safeParse(
    readSetting(CLAUDE_AGENT_AUTH_SETTING),
  );
  return parsed.success ? parsed.data : DEFAULT_CLAUDE_AGENT_AUTH;
}

function getClaudeAgentModel(): ClaudeAgentModel {
  const parsed = claudeAgentModelSchema.safeParse(
    readSetting(CLAUDE_AGENT_MODEL_SETTING),
  );
  return parsed.success ? parsed.data : DEFAULT_CLAUDE_AGENT_MODEL;
}

export class ClaudeAgentAuthError extends Error {
  constructor(
    readonly reason: "cloud_auth_required" | "subscription_auth_required",
    message: string,
  ) {
    super(message);
    this.name = "ClaudeAgentAuthError";
  }
}

export function detectAmbientClaudeLogin(): boolean {
  const home = process.env.HOME ?? process.env.USERPROFILE ?? "";
  if (!home) return false;
  try {
    const configPath = `${home}/.claude.json`;
    if (existsSync(configPath)) {
      const config = readFileSync(configPath, "utf8");
      if (config.includes('"oauthAccount"')) return true;
    }
    return existsSync(`${home}/.claude/.credentials.json`);
  } catch {
    return false;
  }
}

function laneEnv(auth: ClaudeAgentAuth): Record<string, string | undefined> {
  const base: Record<string, string | undefined> = {
    ANTHROPIC_API_KEY: undefined,
    ANTHROPIC_BASE_URL: undefined,
    ANTHROPIC_AUTH_TOKEN: undefined,
    CLAUDE_CODE_OAUTH_TOKEN: undefined,
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
  };

  if (auth === "subscription") {
    const token = readSetting(CLAUDE_AGENT_OAUTH_TOKEN_SETTING)?.trim();
    if (token) base.CLAUDE_CODE_OAUTH_TOKEN = token;
    else if (!detectAmbientClaudeLogin()) {
      throw new ClaudeAgentAuthError(
        "subscription_auth_required",
        "No Claude account found. Sign in with `claude login` or paste a setup token in Settings > Remix.",
      );
    }
    return base;
  }

  const token = getSessionToken();
  if (!token) {
    throw new ClaudeAgentAuthError(
      "cloud_auth_required",
      "Sign in to Freestyle Cloud to run Remix on Freestyle billing.",
    );
  }
  base.ANTHROPIC_BASE_URL = `${freestyleCloudUrl()}/v2/anthropic`;
  base.ANTHROPIC_AUTH_TOKEN = token;
  return base;
}

function remixMcpServer() {
  const tools = Object.fromEntries(
    Object.entries(REMIX_CLIENT_TOOLS).map(([name, def]) => [
      name,
      {
        description: def.description,
        inputSchema: def.inputSchema,
        execute: (input: unknown) => requestClientTool(name, input),
      },
    ]),
  );
  return createAiSdkMcpServer("remix", tools);
}

const REMIX_MCP_TOOL_NAMES = Object.keys(REMIX_CLIENT_TOOLS).map(
  (name) => `mcp__remix__${name}`,
);

const READONLY_BUILTINS = ["Read", "Glob", "Grep", "WebSearch", "WebFetch"];
const FULL_ACCESS_BUILTINS = ["Write", "Edit", "Bash"];

const CLAUDE_AGENT_SYSTEM_APPENDIX = `

## Additional capabilities

Beyond the remix document tools above, you have general-purpose tools: Read/Glob/Grep for the user's files, and WebSearch/WebFetch for the web. Use them when the user's request needs outside information, but stay focused on the writing task — you are a writing assistant operating on the user's screen, not a coding agent. Never mention tool names to the user.`;

function buildSettings(
  auth: ClaudeAgentAuth,
  system: string,
  fullAccess: boolean,
): ClaudeCodeSettings {
  return {
    customSystemPrompt: system,
    maxTurns: CLAUDE_AGENT_MAX_TURNS,
    env: laneEnv(auth),
    mcpServers: { remix: remixMcpServer() },
    permissionMode: "dontAsk",
    allowedTools: [
      ...REMIX_MCP_TOOL_NAMES,
      ...READONLY_BUILTINS,
      ...(fullAccess ? FULL_ACCESS_BUILTINS : []),
    ],
    logger: false,
  };
}

export async function runRemixClaudeAgent(
  request: RemixAgentRequest,
  abortSignal: AbortSignal | undefined,
): Promise<Response> {
  const auth = getClaudeAgentAuth();
  const model = getClaudeAgentModel();
  const fullAccess = readSetting(CLAUDE_AGENT_FULL_ACCESS_SETTING) === "true";
  const system =
    buildRemixAgentSystem(request.context, { hasWebSearch: true }) +
    CLAUDE_AGENT_SYSTEM_APPENDIX;

  const provider = createClaudeCode({
    defaultSettings: buildSettings(auth, system, fullAccess),
  });

  const started = Date.now();
  const result = streamText({
    model: provider(model),
    messages: await convertToModelMessages(request.messages as UIMessage[]),
    abortSignal,
    onError: ({ error }) => {
      log.error(`Remix agent (claude-agent/${auth}) stream error: ${error}`);
    },
    onFinish: ({ usage }) => {
      capture("remix agent completed", {
        provider: `claude-agent-${auth}`,
        model,
        duration_ms: Date.now() - started,
        input_tokens: usage.inputTokens,
        output_tokens: usage.outputTokens,
      });
    },
  });

  return result.toUIMessageStreamResponse({
    onError: (error) => {
      log.error(
        `Remix agent (claude-agent) failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return error instanceof Error ? error.message : "Remix failed.";
    },
  });
}

export async function testClaudeAgent(): Promise<
  { ok: true; model: string } | { ok: false; error: string }
> {
  try {
    const auth = getClaudeAgentAuth();
    const provider = createClaudeCode({
      defaultSettings: {
        customSystemPrompt: "You are a connection test. Reply with exactly: OK",
        maxTurns: 1,
        env: laneEnv(auth),
        permissionMode: "dontAsk",
        allowedTools: [],
        logger: false,
      },
    });
    const model = getClaudeAgentModel();
    const result = await generateText({
      model: provider(model),
      prompt: "Reply with exactly: OK",
      abortSignal: AbortSignal.timeout(90_000),
    });
    if (!result.text.trim())
      return { ok: false, error: "Empty response from Claude." };
    return { ok: true, model };
  } catch (err) {
    const message =
      err instanceof ClaudeAgentAuthError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Connection test failed.";
    log.warn(`Claude agent test failed: ${message}`);
    return { ok: false, error: message };
  }
}
