/**
 * Agent Session Engine (Voice OS).
 *
 * Owns ONE Claude Code agent run. One instance == one run; the
 * `AgentRunRegistry` (see ./run-registry) creates an instance per run so many
 * runs stream in parallel. Each instance is stamped with a stable `runId` at
 * construction and tags every emitted event with it, so the registry/UI can
 * route concurrent streams to the right thread. Spawns the run via the Claude
 * Agent SDK's `query()`, iterates its async message stream, normalizes each
 * message to the shared `AgentEvent` contract, and forwards it via the `emit`
 * callback (the registry wires this to the bar window in main/index.ts).
 *
 * Tool/permission posture: FULL AUTONOMY by design (owner's decision) — the
 * agent gets every Claude Code tool via the `claude_code` preset and runs them
 * without approval via `permissionMode: "bypassPermissions"` (which the SDK
 * requires be paired with `allowDangerouslySkipPermissions: true`). There is
 * therefore no approval gate in this build; the agent can read, edit, run
 * shell commands, fetch the web, etc. Note: bypassPermissions cannot run as
 * root on Unix.
 */
import { query } from "@anthropic-ai/claude-agent-sdk";
import { createAppLogger } from "@freestyle/utils";
import type { AgentEvent, AgentRunStatus } from "@freestyle/validations";
import { hideGuidanceOverlay } from "../overlay.js";
import { isAuthReady, resolveAuth } from "./auth.js";
import {
  computerUseEnabled,
  computerUsePrereqs,
  computerUseSelfTest,
  createComputerUseServer,
} from "./computer-use.js";
import { readAgentSettings } from "./settings.js";

const log = createAppLogger("agent-session");

function isTerminalStatus(status: AgentRunStatus): boolean {
  return status === "done" || status === "error" || status === "canceled";
}

/**
 * Map a raw SDK/transport error onto a clear, actionable message. The Agent SDK
 * surfaces auth failures as opaque 401/oauth strings; without this the bar just
 * shows "Agent run failed: 401". Returns null when nothing matches (caller uses
 * the original message).
 */
function friendlyError(message: string): string | null {
  if (
    /\b401\b|unauthor|authentication|invalid api key|invalid x-api-key|oauth|not logged in|please log ?in|credit balance/i.test(
      message,
    )
  ) {
    return "Couldn't authenticate with Claude. Sign in with `claude login`, or add a Claude API key in Settings → Computer Use.";
  }
  return null;
}

interface ContentBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
  tool_use_id?: string;
  content?: unknown;
  is_error?: boolean;
}

export class AgentSessionManager {
  private controller: AbortController | null = null;
  private running = false;
  private canceled = false;

  /**
   * @param runId Stable id for this run; stamped onto every emitted event.
   * @param emit  Sink for normalized events (registry-wrapped per run).
   */
  constructor(
    private readonly runId: string,
    private readonly emit: (event: AgentEvent) => void,
  ) {}

  isRunning(): boolean {
    return this.running;
  }

  /**
   * Begin the run. Fire-and-forget: streaming happens via `emit`. Ignored if
   * this instance's run is already in flight (each instance runs exactly once
   * at a time; concurrency across runs is handled by the registry).
   *
   * `computerUse` is decided by the registry (it holds the single-owner desktop
   * lock); when omitted we fall back to the global opt-in.
   */
  start(input: {
    prompt: string;
    cwd: string;
    resume?: string;
    computerUse?: boolean;
  }): void {
    if (this.running) {
      log.warn("start() ignored — this run is already in flight");
      return;
    }
    this.running = true;
    this.canceled = false;
    void this.run(input.prompt, input.cwd, input.resume, input.computerUse);
  }

  cancel(): void {
    if (!this.running || !this.controller) return;
    this.canceled = true;
    this.controller.abort();
  }

  private async run(
    prompt: string,
    cwd: string,
    resume?: string,
    computerUseFlag?: boolean,
  ): Promise<void> {
    const controller = new AbortController();
    this.controller = controller;
    let sessionId = resume ?? "";

    let terminalEmitted = false;
    const emitStatus = (status: AgentRunStatus): void => {
      if (isTerminalStatus(status)) terminalEmitted = true;
      this.emit({ type: "status", runId: this.runId, sessionId, status });
    };

    emitStatus("starting");

    const settings = readAgentSettings();
    const { env } = resolveAuth(settings);

    // Computer use (opt-in, experimental): when enabled, attach the macOS
    // desktop actuator as an in-process MCP server so the agent can screenshot,
    // click, and type on the real machine. Off by default — see computer-use.ts.
    // The registry decides this per run (only one run may hold the desktop at a
    // time); fall back to the global opt-in when called outside the registry.
    const computerUse = computerUseFlag ?? computerUseEnabled(settings);

    try {
      // Pre-flight: catch missing computer-use prerequisites *before* launching,
      // so the user gets a precise, fixable message instead of the agent dying
      // mid-run with blank screenshots or no-op clicks. Reliable OS checks only,
      // so this is safe to hard-block on.
      if (computerUse) {
        const prereqs = await computerUsePrereqs(settings);
        if (!prereqs.ok) {
          this.emit({
            type: "error",
            runId: this.runId,
            sessionId,
            message:
              prereqs.reason ??
              "Computer use is enabled but its setup is incomplete. See Settings → Computer Use.",
          });
          emitStatus("error");
          return;
        }
        // Non-blocking functional check: surfaces *silent* actuator breakage
        // (a helper that's present but no longer actuates) in the logs without
        // failing the run, since prereqs already passed the hard checks.
        const selfTest = await computerUseSelfTest(settings);
        if (!selfTest.ok) {
          log.warn(`computer-use self-test failed: ${selfTest.details}`);
        }
      }

      // Auth is checked here as a *soft* heuristic: we warn early when no login
      // or key is detected, but still launch so a false negative can't lock out
      // a working subscription. Real auth failures are caught + humanized below.
      if (!isAuthReady(settings)) {
        log.warn("Launching agent run without a detected Claude login/API key");
      }

      const stream = query({
        prompt,
        options: {
          cwd,
          abortController: controller,
          env,
          // Continue a prior conversation when resuming; new session otherwise.
          ...(resume ? { resume } : {}),
          // Every Claude Code tool, run without approval prompts.
          tools: { type: "preset", preset: "claude_code" },
          ...(computerUse
            ? { mcpServers: { computer: createComputerUseServer(settings) } }
            : {}),
          permissionMode: "bypassPermissions",
          allowDangerouslySkipPermissions: true,
          stderr: (data: string) => log.debug(`[claude] ${data.trim()}`),
        },
      });

      for await (const msg of stream) {
        log.debug(`[run ${this.runId}] agent message: ${msg.type}`);
        switch (msg.type) {
          case "system": {
            if (msg.subtype === "init") {
              sessionId = msg.session_id;
              emitStatus("running");
              this.emit({
                type: "session_info",
                runId: this.runId,
                sessionId,
                model: msg.model,
                apiKeySource: msg.apiKeySource,
                cwd: msg.cwd,
              });
            }
            break;
          }
          case "assistant": {
            const blocks = (msg.message?.content ?? []) as ContentBlock[];
            for (const block of blocks) {
              if (block.type === "text" && block.text) {
                this.emit({
                  type: "assistant_text",
                  runId: this.runId,
                  sessionId,
                  text: block.text,
                });
              } else if (block.type === "tool_use") {
                this.emit({
                  type: "tool_use",
                  runId: this.runId,
                  sessionId,
                  id: block.id ?? "",
                  name: block.name ?? "",
                  input: block.input,
                });
              }
            }
            break;
          }
          case "user": {
            // Tool results come back as user-message tool_result blocks.
            const content = (msg.message as { content?: unknown })?.content;
            if (Array.isArray(content)) {
              for (const block of content as ContentBlock[]) {
                if (block.type === "tool_result") {
                  this.emit({
                    type: "tool_result",
                    runId: this.runId,
                    sessionId,
                    id: block.tool_use_id ?? "",
                    result: block.content,
                    isError: block.is_error,
                  });
                }
              }
            }
            break;
          }
          case "result": {
            this.emit({
              type: "result",
              runId: this.runId,
              sessionId,
              usage: {
                inputTokens: msg.usage?.input_tokens ?? 0,
                outputTokens: msg.usage?.output_tokens ?? 0,
                costUsd: msg.total_cost_usd,
              },
              durationMs: msg.duration_ms,
              stopReason: msg.stop_reason,
            });
            emitStatus(msg.is_error ? "error" : "done");
            break;
          }
        }
      }
    } catch (err) {
      if (this.canceled) {
        emitStatus("canceled");
      } else {
        const raw = err instanceof Error ? err.message : String(err);
        log.error(`Agent run failed: ${raw}`);
        this.emit({
          type: "error",
          runId: this.runId,
          sessionId,
          message: friendlyError(raw) ?? raw,
        });
        emitStatus("error");
      }
    } finally {
      this.running = false;
      this.controller = null;
      if (!terminalEmitted) {
        log.warn("Agent stream ended without a terminal status; synthesizing");
        this.emit({
          type: "error",
          runId: this.runId,
          sessionId,
          message: "Agent stopped without returning a result.",
        });
        emitStatus("error");
      }
      // Clear any guided ghost-cursor overlay left on screen (no-op in full
      // mode / when nothing was shown). Only the run that held computer use may
      // touch the shared overlay — otherwise a finishing parallel run would wipe
      // an active run's ghost cursor.
      if (computerUse) hideGuidanceOverlay();
    }
  }
}
