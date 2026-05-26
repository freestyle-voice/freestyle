import {
  type CommandContext,
  buildCommand as stricliBuildCommand,
} from "@stricli/core";
import type { FreestyleContext } from "../context.js";
import { CliError } from "./errors.js";
import { CommandOutput, type OutputConfig, renderOutput } from "./output.js";

const GLOBAL_FLAGS = {
  json: {
    kind: "boolean",
    brief: "Output as JSON",
    default: false,
  },
  port: {
    kind: "parsed",
    parse: Number,
    brief: "Server port",
    optional: true,
    default: undefined,
  },
} as const;

/**
 * Wrapper around Stricli's buildCommand that injects global --json and --port
 * flags and handles output rendering + error formatting.
 *
 * Commands yield CommandOutput instances from an async generator. The wrapper
 * iterates the generator and renders each output in human or JSON mode.
 */
export function buildCommand<TData>(config: {
  docs: { brief: string };
  output: OutputConfig<TData>;
  parameters?: {
    flags?: Record<string, any>;
    positional?: any;
  };
  func: (
    this: FreestyleContext,
    flags: any,
    ...args: any[]
  ) => AsyncGenerator<CommandOutput<TData>, void, unknown>;
}) {
  const { func: commandFunc, output: outputConfig, ...rest } = config;

  const mergedFlags = {
    ...config.parameters?.flags,
    ...GLOBAL_FLAGS,
  };

  const parameters: any = { flags: mergedFlags };
  if (config.parameters?.positional) {
    parameters.positional = config.parameters.positional;
  }

  return stricliBuildCommand({
    ...rest,
    parameters,
    async func(
      this: CommandContext,
      flags: any,
      ...args: any[]
    ): Promise<undefined | Error> {
      const ctx = this as unknown as FreestyleContext;
      try {
        const gen = commandFunc.call(ctx, flags, ...args);
        for await (const value of gen) {
          if (value instanceof CommandOutput) {
            renderOutput(value, outputConfig, ctx, flags.json);
          }
        }
      } catch (err) {
        if (err instanceof CliError) {
          if (flags.json) {
            ctx.process.stdout.write(
              JSON.stringify({ error: err.message }, null, 2),
            );
            ctx.process.stdout.write("\n");
          } else {
            ctx.process.stderr.write(`Error: ${err.message}\n`);
          }
          ctx.process.exitCode = err.exitCode;
          return;
        }
        throw err;
      }
    },
  });
}
