import chalk from "chalk";
import { buildCommand } from "../lib/command.js";
import { DEFAULT_PORT } from "../lib/constants.js";
import { CommandOutput } from "../lib/output.js";

interface ServeData {
  port: number;
  message: string;
}

export const serveCommand = buildCommand<ServeData>({
  docs: { brief: "Start the Freestyle server" },
  output: {
    human: (data) => data.message,
    json: (data) => ({ port: data.port }),
  },
  async *func(flags) {
    const port = flags.port ?? DEFAULT_PORT;
    const proc = this.process;

    const { serve } = await import("@hono/node-server");
    const { default: app } = await import("@freestyle/server");

    yield new CommandOutput({
      port,
      message: chalk.green(
        `Freestyle server listening on port ${String(port)}`,
      ),
    });

    await new Promise<void>((resolve, reject) => {
      const server = serve({ fetch: app.fetch, port }, () => {
        proc.stdout.write(
          `  ${chalk.dim("Local:")}  http://localhost:${String(port)}\n`,
        );
        proc.stdout.write(
          `  ${chalk.dim("Press")}  ${chalk.bold("Ctrl+C")} to stop\n`,
        );
      });

      proc.on("SIGINT", () => {
        server.close();
        resolve();
      });
      proc.on("SIGTERM", () => {
        server.close();
        resolve();
      });
      server.on("error", reject);
    });
  },
});
