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

/**
 * Best-effort check for an existing Claude subscription login.
 *
 * Claude Code records the signed-in account in `~/.claude.json` under
 * `oauthAccount` (the actual OAuth tokens live in the macOS Keychain or
 * `~/.claude/.credentials.json` on Linux). Checking for that key is a cheap,
 * cross-platform signal that the user has run `claude login` at least once,
 * without us shelling out to `security` or reading secrets. This is a
 * heuristic — we use it to *guide* setup, never to hard-block a run (so a
 * false negative can't lock a working subscription out).
 */
function hasSubscriptionLogin(): boolean {
  try {
    const raw = readFileSync(
      join(app.getPath("home"), ".claude.json"),
      "utf-8",
    );
    const parsed = JSON.parse(raw) as { oauthAccount?: unknown };
    return (
      typeof parsed.oauthAccount === "object" && parsed.oauthAccount !== null
    );
  } catch {
    return false;
  }
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
  const authMode = getAgentAuthMode();
  const apiKeyConfigured = !!readAgentApiKey();
  const subscriptionLoggedIn = hasSubscriptionLogin();
  // Mirror resolveAuth()'s effective path: api-key mode uses the key only when
  // one is stored; every other case falls back to the subscription login.
  const authReady =
    authMode === "api-key" && apiKeyConfigured ? true : subscriptionLoggedIn;
  return {
    authMode,
    apiKeyConfigured,
    subscriptionLoggedIn,
    authReady,
  };
}

/** Convenience predicate for the run-time pre-flight gate. */
export function isAuthReady(): boolean {
  return getPrereqStatus().authReady;
}
