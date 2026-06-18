/**
 * Agent auth resolution (Voice OS, Phase 0 — Part F).
 *
 * Two paths, controlled purely by whether we inject ANTHROPIC_API_KEY into the
 * spawned Claude Code subprocess env:
 *   - "subscription": no key injected → the bundled CLI uses the user's logged-in
 *     Claude account (~/.claude credentials); draws from their subscription.
 *   - "api-key": inject the stored `claude-agent` key → metered API billing.
 *
 * The SDK's `env` option REPLACES the subprocess env, so callers must spread
 * `process.env` themselves; `resolveAuth().env` returns the full env to pass.
 *
 * NOTE: the Agent SDK message `init.apiKeySource` ("oauth" = subscription) is the
 * source of truth at runtime and is surfaced to the UI via a `session_info` event.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createAppLogger } from "@freestyle/utils";
import type { AgentAuthMode, AgentPrereqStatus } from "@freestyle/validations";
import { app } from "electron";

const log = createAppLogger("agent-auth");

/** Dedicated key slot so agent cost/validation stay independent of dictation. */
export const AGENT_KEY_PROVIDER = "claude-agent";

function readSettingsFile(): Record<string, unknown> {
  try {
    return JSON.parse(
      readFileSync(join(app.getPath("userData"), "settings.json"), "utf-8"),
    );
  } catch {
    return {};
  }
}

export function getAgentAuthMode(): AgentAuthMode {
  return readSettingsFile().agentAuthMode === "api-key"
    ? "api-key"
    : "subscription";
}

function readAgentApiKey(): string | null {
  try {
    const dbPath = process.env.FREESTYLE_DB_PATH;
    if (!dbPath) return null;
    const db = new DatabaseSync(dbPath);
    const row = db
      .prepare("SELECT key FROM api_keys WHERE provider = ?")
      .get(AGENT_KEY_PROVIDER) as { key: string } | undefined;
    db.close();
    return row?.key ?? null;
  } catch (err) {
    log.warn(`Failed to read agent API key: ${String(err)}`);
    return null;
  }
}

export interface ResolvedAuth {
  mode: AgentAuthMode;
  env: NodeJS.ProcessEnv;
  apiKeyConfigured: boolean;
}

/**
 * Resolve the env to hand the SDK. In api-key mode we inject the stored key;
 * in subscription mode we strip any ambient ANTHROPIC_API_KEY so a key sitting
 * in the dev shell doesn't silently override the subscription login.
 */
export function resolveAuth(): ResolvedAuth {
  const apiKey = readAgentApiKey();
  const requested = getAgentAuthMode();
  const env: NodeJS.ProcessEnv = { ...process.env };

  // api-key mode only takes effect when a key is actually stored; otherwise we
  // fall back to subscription rather than spawning with no credentials.
  if (requested === "api-key" && apiKey) {
    env.ANTHROPIC_API_KEY = apiKey;
    return { mode: "api-key", env, apiKeyConfigured: true };
  }

  env.ANTHROPIC_API_KEY = undefined;
  return { mode: "subscription", env, apiKeyConfigured: !!apiKey };
}

export function getPrereqStatus(): AgentPrereqStatus {
  return {
    authMode: getAgentAuthMode(),
    apiKeyConfigured: !!readAgentApiKey(),
  };
}
