/**
 * Agent Session Engine (Voice OS, Phase 0 — Part A).
 *
 * Owns a SINGLE Claude Code agent run for the slice. Spawns the run via the
 * Claude Agent SDK's `query()`, iterates its async message stream, normalizes
 * each message to the shared `AgentEvent` contract, and forwards it via the
 * `emit` callback (wired to the bar window in main/index.ts).
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
import type { AgentEvent } from "@freestyle/validations";
import { resolveAuth } from "./auth.js";

const log = createAppLogger("agent-session");

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

  constructor(private readonly emit: (event: AgentEvent) => void) {}

  isRunning(): boolean {
    return this.running;
  }

  /**
   * Begin a run. Fire-and-forget: streaming happens via `emit`. Ignored if a
   * run is already in flight (single-session slice).
   */
  start(input: { prompt: string; cwd: string; resume?: string }): void {
    if (this.running) {
      log.warn("start() ignored — a session is already running");
      return;
    }
    this.running = true;
    this.canceled = false;
    void this.run(input.prompt, input.cwd, input.resume);
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
  ): Promise<void> {
    const controller = new AbortController();
    this.controller = controller;
    let sessionId = resume ?? "";

    this.emit({ type: "status", sessionId, status: "starting" });

    const { env } = resolveAuth();

    try {
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
          permissionMode: "bypassPermissions",
          allowDangerouslySkipPermissions: true,
          stderr: (data: string) => log.debug(`[claude] ${data.trim()}`),
        },
      });

      for await (const msg of stream) {
        switch (msg.type) {
          case "system": {
            if (msg.subtype === "init") {
              sessionId = msg.session_id;
              this.emit({ type: "status", sessionId, status: "running" });
              this.emit({
                type: "session_info",
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
                  sessionId,
                  text: block.text,
                });
              } else if (block.type === "tool_use") {
                this.emit({
                  type: "tool_use",
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
              sessionId,
              usage: {
                inputTokens: msg.usage?.input_tokens ?? 0,
                outputTokens: msg.usage?.output_tokens ?? 0,
                costUsd: msg.total_cost_usd,
              },
              durationMs: msg.duration_ms,
              stopReason: msg.stop_reason,
            });
            this.emit({
              type: "status",
              sessionId,
              status: msg.is_error ? "error" : "done",
            });
            break;
          }
        }
      }
    } catch (err) {
      if (this.canceled) {
        this.emit({ type: "status", sessionId, status: "canceled" });
      } else {
        const message = err instanceof Error ? err.message : String(err);
        log.error(`Agent run failed: ${message}`);
        this.emit({ type: "error", sessionId, message });
        this.emit({ type: "status", sessionId, status: "error" });
      }
    } finally {
      this.running = false;
      this.controller = null;
    }
  }
}
