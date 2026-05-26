import type { FreestyleContext } from "../context.js";

export class CommandOutput<T> {
  constructor(public readonly data: T) {}
}

export interface OutputConfig<T> {
  human: (data: T, ctx: FreestyleContext) => string;
  json: (data: T) => unknown;
}

export function renderOutput<T>(
  output: CommandOutput<T>,
  config: OutputConfig<T>,
  ctx: FreestyleContext,
  jsonMode: boolean,
): void {
  if (jsonMode) {
    ctx.process.stdout.write(JSON.stringify(config.json(output.data), null, 2));
    ctx.process.stdout.write("\n");
  } else {
    const text = config.human(output.data, ctx);
    if (text) {
      ctx.process.stdout.write(text);
      ctx.process.stdout.write("\n");
    }
  }
}
