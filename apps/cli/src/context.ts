import type { CommandContext } from "@stricli/core";

/**
 * Extended command context for Freestyle CLI.
 *
 * Stricli's CommandContext requires `process: { stdout, stderr }`.
 * We extend it to expose the full Node process and env for commands that
 * need more (e.g. `serve` registers signal handlers).
 */
export interface FreestyleContext extends CommandContext {
  readonly process: NodeJS.Process;
  readonly env: NodeJS.ProcessEnv;
}
