import { run } from "@stricli/core";
import { buildApplication } from "./app.js";
import type { FreestyleContext } from "./context.js";

export async function startCli(args: string[]): Promise<void> {
  const context: FreestyleContext = {
    process,
    env: process.env,
  };

  const app = buildApplication();
  await run(app, args, context);
}
