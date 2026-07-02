import { spawn } from "node:child_process";
import process from "node:process";
import type { PluginLogger } from "freestyle-voice";
import type { CommandAction } from "./types.js";

/** Whether macOS-only actions (Shortcuts) are available on this host. */
export function isMacOS(): boolean {
  return process.platform === "darwin";
}

const INPUT_PLACEHOLDER = /\{\{\s*input\s*\}\}/g;

/**
 * Spawn a child process and resolve with its stdout, rejecting on a non-zero
 * exit. Input, when provided, is written to stdin. Never uses a shell unless
 * `shell` is set, keeping argument passing injection-safe by default.
 */
function run(
  command: string,
  args: string[],
  opts: { input?: string; shell?: boolean; env?: NodeJS.ProcessEnv } = {},
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: opts.shell ?? false,
      env: opts.env ?? process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (d) => {
      stdout += d;
    });
    child.stderr?.on("data", (d) => {
      stderr += d;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(stderr.trim() || `exited with code ${code}`));
    });
    if (opts.input !== undefined) child.stdin?.write(opts.input);
    child.stdin?.end();
  });
}

/** Open a URL or app scheme with the platform opener. */
async function openUrl(url: string): Promise<string> {
  if (process.platform === "darwin") return run("open", [url]);
  if (process.platform === "win32") return run("cmd", ["/c", "start", "", url]);
  return run("xdg-open", [url]);
}

/**
 * Execute a command's action with the extracted `input`. Returns a short human
 * description of what happened, which the agent surfaces back to the model.
 * Throws on failure so the caller can report it.
 */
export async function runAction(
  action: CommandAction,
  input: string,
  logger: PluginLogger,
): Promise<string> {
  switch (action.type) {
    case "webhook": {
      const method = action.method ?? "POST";
      let url = action.url;
      const init: RequestInit = { method, headers: { ...action.headers } };
      if (method === "POST") {
        (init.headers as Record<string, string>)["Content-Type"] ??=
          "application/json";
        init.body = JSON.stringify({ input });
      } else {
        const u = new URL(url);
        u.searchParams.set("input", input);
        url = u.toString();
      }
      const res = await fetch(url, init);
      if (!res.ok) throw new Error(`webhook returned ${res.status}`);
      logger.info(`webhook ${method} ${action.url} → ${res.status}`);
      return `Called ${method} ${action.url} (${res.status}).`;
    }

    case "openUrl": {
      const url = action.url.replace(
        INPUT_PLACEHOLDER,
        encodeURIComponent(input),
      );
      await openUrl(url);
      logger.info(`opened ${url}`);
      return `Opened ${url}.`;
    }

    case "shell": {
      const command = action.command.replace(INPUT_PLACEHOLDER, input);
      const out = await run(command, [], {
        shell: true,
        input,
        env: { ...process.env, FREESTYLE_COMMAND_INPUT: input },
      });
      logger.info(`ran shell command`);
      return out ? `Ran command:\n${out}` : "Ran command.";
    }

    case "shortcut": {
      if (!isMacOS()) throw new Error("Shortcuts are only available on macOS.");
      await run("shortcuts", ["run", action.name], { input });
      logger.info(`ran shortcut "${action.name}"`);
      return `Ran the "${action.name}" shortcut.`;
    }
  }
}
