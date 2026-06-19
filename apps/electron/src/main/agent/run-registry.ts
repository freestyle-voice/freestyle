/**
 * Agent Run Registry (Voice OS) — multiplexes concurrent Claude Code runs.
 *
 * The old design ran a single `AgentSessionManager`, so a second prompt was
 * dropped while one was in flight. This registry instead owns a map of live
 * runs (one `AgentSessionManager` each) keyed by `runId`, so many runs stream
 * in parallel — the bar renders one thread per run.
 *
 * Two things it enforces that a bare map of managers wouldn't:
 *
 *  1. Concurrency cap — a sanity ceiling on simultaneous runs so a burst of
 *     prompts can't spawn unbounded agent processes (and rate-limit the
 *     account). Beyond the cap, `start()` fails fast with a clear message.
 *
 *  2. Computer-use single-owner lock — there is exactly ONE physical mouse,
 *     keyboard, screen, and ghost-cursor overlay. Letting two runs drive the
 *     desktop at once is chaos, so only the first live run to request computer
 *     use gets it; concurrent runs start as normal text/code agents (no desktop
 *     control) and the caller is told via `computerUse: false`. The lock is
 *     released the moment its owner reaches a terminal status.
 *
 * Event routing: each run's manager is given an `emit` closure that the run has
 * already stamped with its `runId` (see session-manager). The registry forwards
 * events to the single bar sink, observes terminal `status` events to clean up
 * the run (and release the lock), and is the only place that knows a run is
 * "over".
 */
import { randomUUID } from "node:crypto";
import { createAppLogger } from "@freestyle/utils";
import type {
  AgentEvent,
  AgentRunStatus,
  AgentRunSummary,
  AgentStartResult,
} from "@freestyle/validations";
import { computerUseEnabled } from "./computer-use.js";
import { AgentSessionManager } from "./session-manager.js";

const log = createAppLogger("agent-registry");

/** Default ceiling on simultaneous runs. */
const DEFAULT_MAX_CONCURRENCY = 4;

function isTerminal(status: AgentRunStatus): boolean {
  return status === "done" || status === "error" || status === "canceled";
}

function deriveRunTitle(prompt: string): string {
  const clean = prompt.replace(/\s+/g, " ").trim();
  return clean.length > 42
    ? `${clean.slice(0, 42)}…`
    : clean || "Running agent";
}

interface ActiveRun {
  runId: string;
  manager: AgentSessionManager;
  sessionId: string;
  status: AgentRunStatus;
  /** True if this run currently holds the computer-use lock. */
  computerUse: boolean;
  title: string;
  startedAt: number;
}

export class AgentRunRegistry {
  private readonly runs = new Map<string, ActiveRun>();
  /** runId currently holding the single computer-use lock, or null. */
  private cuOwner: string | null = null;
  private readonly maxConcurrency: number;

  /**
   * @param emit Single sink to the bar window (already-tagged events flow
   *             straight through; the registry only inspects status).
   */
  constructor(
    private readonly emit: (event: AgentEvent) => void,
    opts?: { maxConcurrency?: number },
  ) {
    this.maxConcurrency = opts?.maxConcurrency ?? DEFAULT_MAX_CONCURRENCY;
  }

  /** Snapshot of live runs, for re-syncing a freshly (re)mounted bar. */
  list(): AgentRunSummary[] {
    return [...this.runs.values()].map((r) => ({
      runId: r.runId,
      sessionId: r.sessionId,
      status: r.status,
      computerUse: r.computerUse,
      title: r.title,
      startedAt: r.startedAt,
    }));
  }

  /**
   * Start a new run. `runId` is supplied by the caller (the renderer mints it so
   * it can route the synchronous "starting" event that fires before this call
   * even returns); we mint a fallback if absent. Returns immediately —
   * streaming happens via `emit`.
   */
  start(input: {
    prompt: string;
    cwd: string;
    resume?: string;
    runId?: string;
  }): AgentStartResult {
    const runId = input.runId ?? randomUUID();

    if (this.runs.has(runId)) {
      return { ok: false, runId, computerUse: false, error: "Duplicate runId" };
    }
    if (this.runs.size >= this.maxConcurrency) {
      return {
        ok: false,
        runId,
        computerUse: false,
        error: `Too many agents running at once (max ${this.maxConcurrency}). Wait for one to finish.`,
      };
    }

    // Computer-use lock: grant only if the user opted in AND nobody else holds
    // the desktop right now.
    const computerUse = computerUseEnabled() && this.cuOwner === null;
    if (computerUse) this.cuOwner = runId;

    const manager = new AgentSessionManager(runId, (event) =>
      this.handleEvent(runId, event),
    );
    this.runs.set(runId, {
      runId,
      manager,
      sessionId: input.resume ?? "",
      status: "starting",
      computerUse,
      title: deriveRunTitle(input.prompt),
      startedAt: Date.now(),
    });

    log.info(
      `run ${runId} starting (live=${this.runs.size}, computerUse=${computerUse})`,
    );
    manager.start({
      prompt: input.prompt,
      cwd: input.cwd,
      resume: input.resume,
      computerUse,
    });

    return { ok: true, runId, computerUse };
  }

  /** Cancel one run by id (no-op if unknown/already finished). */
  cancel(runId: string): void {
    this.runs.get(runId)?.manager.cancel();
  }

  /** Cancel every live run (used on app quit). */
  cancelAll(): void {
    for (const run of this.runs.values()) run.manager.cancel();
  }

  /**
   * Forward an event to the bar, keeping per-run bookkeeping in sync and
   * retiring the run (and releasing the computer-use lock) on terminal status.
   */
  private handleEvent(runId: string, event: AgentEvent): void {
    const run = this.runs.get(runId);
    if (run) {
      if (event.sessionId) run.sessionId = event.sessionId;
      if (event.type === "status") run.status = event.status;
    }

    this.emit(event);

    if (event.type === "status" && isTerminal(event.status)) {
      if (this.cuOwner === runId) this.cuOwner = null;
      this.runs.delete(runId);
      log.info(`run ${runId} ${event.status} (live=${this.runs.size})`);
    }
  }
}
