/**
 * Shared contracts for the Claude Code agent feature (Voice OS, Phase 0).
 *
 * These are transport-agnostic plain TypeScript types crossing the Electron
 * IPC boundary (main → renderer for events, renderer → main for control).
 * The main-process normalization layer (apps/electron/src/main/agent) is the
 * ONLY place that knows the Claude Agent SDK's message shapes; it maps them
 * onto `AgentEvent` so the renderer never depends on the SDK.
 */

/** How an agent run authenticates against Anthropic. */
export type AgentAuthMode = "subscription" | "api-key";

/** Token/cost usage reported at the end of a run. */
export interface AgentUsage {
  inputTokens: number;
  outputTokens: number;
  /** Total cost in USD, when the SDK reports it (API-key runs). */
  costUsd?: number;
}

/**
 * A normalized event streamed from a running agent session to the bar UI.
 * `sessionId` is the SDK session id once the `init` message arrives, or ""
 * before then.
 */
export type AgentEvent =
  | {
      type: "status";
      sessionId: string;
      status: "starting" | "running" | "done" | "error" | "canceled";
    }
  | {
      type: "session_info";
      sessionId: string;
      model: string;
      /** SDK `apiKeySource`: "oauth" indicates a subscription login. */
      apiKeySource: string;
      cwd: string;
    }
  | { type: "assistant_text"; sessionId: string; text: string }
  | {
      type: "tool_use";
      sessionId: string;
      id: string;
      name: string;
      input: unknown;
    }
  | {
      type: "tool_result";
      sessionId: string;
      id: string;
      result: unknown;
      isError?: boolean;
    }
  | {
      type: "result";
      sessionId: string;
      usage: AgentUsage;
      durationMs: number;
      stopReason?: string | null;
    }
  | { type: "error"; sessionId: string; message: string };

/** Snapshot of agent prerequisites, surfaced in the bar before a run. */
export interface AgentPrereqStatus {
  /** The configured/effective auth mode. */
  authMode: AgentAuthMode;
  /** Whether a dedicated `claude-agent` API key is stored. */
  apiKeyConfigured: boolean;
}

/** A past agent conversation, sourced from the SDK's on-disk session store. */
export interface AgentConversation {
  /** SDK session id (used to resume). */
  id: string;
  title: string;
  /** Last-modified time, ms since epoch. */
  updatedAt: number;
}

/** A single prior message when loading a past conversation's transcript. */
export interface AgentMessage {
  role: "user" | "assistant";
  text: string;
}
