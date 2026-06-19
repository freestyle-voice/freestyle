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

/** A run's lifecycle status. */
export type AgentRunStatus =
  | "starting"
  | "running"
  | "done"
  | "error"
  | "canceled";

/**
 * A normalized event streamed from a running agent session to the bar UI.
 *
 * `runId` is the stable, client-supplied id for a single run — known from the
 * moment a run is requested, so the UI can route events to the right thread
 * even before the SDK assigns a session. Multiple runs stream concurrently;
 * `runId` is what distinguishes them.
 *
 * `sessionId` is the SDK session id, populated once the `init` message arrives
 * (or "" before then). It is the resumable conversation handle, NOT the run
 * identity — a follow-up in the same conversation reuses `sessionId` under a
 * fresh `runId`.
 */
export type AgentEvent =
  | {
      type: "status";
      runId: string;
      sessionId: string;
      status: AgentRunStatus;
    }
  | {
      type: "session_info";
      runId: string;
      sessionId: string;
      model: string;
      /** SDK `apiKeySource`: "oauth" indicates a subscription login. */
      apiKeySource: string;
      cwd: string;
    }
  | { type: "assistant_text"; runId: string; sessionId: string; text: string }
  | {
      type: "tool_use";
      runId: string;
      sessionId: string;
      id: string;
      name: string;
      input: unknown;
    }
  | {
      type: "tool_result";
      runId: string;
      sessionId: string;
      id: string;
      result: unknown;
      isError?: boolean;
    }
  | {
      type: "result";
      runId: string;
      sessionId: string;
      usage: AgentUsage;
      durationMs: number;
      stopReason?: string | null;
    }
  | { type: "error"; runId: string; sessionId: string; message: string };

/** Result of requesting a new run from the registry. */
export interface AgentStartResult {
  ok: boolean;
  /** Echoed run id (the one the caller supplied, or a minted fallback). */
  runId: string;
  /**
   * Whether this run was granted control of the (singular) computer-use
   * actuator. False when computer use is off, or when another live run already
   * holds the desktop-control lock.
   */
  computerUse: boolean;
  /** Present when `ok` is false. */
  error?: string;
}

/** A live run, for re-syncing the bar after it (re)mounts. */
export interface AgentRunSummary {
  runId: string;
  sessionId: string;
  status: AgentRunStatus;
  /** True if this run currently holds the computer-use lock. */
  computerUse: boolean;
}

/** Snapshot of agent prerequisites, surfaced in the bar before a run. */
export interface AgentPrereqStatus {
  /** The configured/effective auth mode. */
  authMode: AgentAuthMode;
  /** Whether a dedicated `claude-agent` API key is stored. */
  apiKeyConfigured: boolean;
  /** Whether a Claude subscription login exists on this machine
   *  (`~/.claude.json` records a logged-in `oauthAccount`). */
  subscriptionLoggedIn: boolean;
  /**
   * Whether the *effective* auth path can actually authenticate a run right
   * now: api-key mode with a stored key, or any mode falling back to a
   * subscription login. When false, a run will fail with an auth error and the
   * user needs to sign in (`claude login`) or add an API key.
   */
  authReady: boolean;
}

/** State of a single setup prerequisite. */
export type PrereqState = "ok" | "missing" | "denied" | "unknown";

/**
 * Detailed computer-use prerequisites, probed live in the main process before
 * (and during) a run. Unlike a single boolean, this distinguishes the three
 * independent things computer use needs so the UI can guide the user to fix
 * exactly the one that's missing.
 */
export interface ComputerUsePrereqs {
  /** True only when the platform is supported and every item below is `ok`. */
  ok: boolean;
  /** False on non-macOS builds — computer use is macOS-only for now. */
  platformSupported: boolean;
  /** The bundled/Homebrew `cliclick` helper used for mouse + keyboard. */
  helper: PrereqState;
  /** macOS Accessibility permission — required to move/click/type. */
  accessibility: PrereqState;
  /** macOS Screen Recording permission — required for non-black screenshots. */
  screenRecording: PrereqState;
  /** Human-readable summary of the first blocking issue, when not `ok`. */
  reason?: string;
}

/**
 * How computer use actuates:
 *  - `full`   — the agent directly drives the real cursor/keyboard.
 *  - `guided` — the agent never actuates; it shows a "ghost cursor" overlay and
 *               captions pointing the user to each step, and the user performs
 *               it. Non-invasive, and a teaching experience.
 */
export type ComputerUseMode = "full" | "guided";

/**
 * A single guidance instruction pushed from main → the overlay window in
 * `guided` mode. Coordinates are LOGICAL pixels in the most recent screenshot's
 * space (top-left origin), matching the agent's tool coordinates.
 */
export interface GuidanceEvent {
  kind:
    | "move"
    | "click"
    | "right_click"
    | "double_click"
    | "type"
    | "key"
    | "clear";
  /** Target point for cursor/click kinds. */
  x?: number;
  y?: number;
  /** Short human caption describing the step, e.g. "Click the Export button". */
  caption?: string;
  /** For `type`/`key`: the text or key chord to display in the hint. */
  text?: string;
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
