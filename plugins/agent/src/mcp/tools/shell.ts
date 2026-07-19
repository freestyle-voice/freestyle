import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

const DANGEROUS_PATTERNS = [
  /\brm\s+(-[a-zA-Z]*f[a-zA-Z]*\s+)?(-[a-zA-Z]*r[a-zA-Z]*\s+)?\/\s*$/,
  /\brm\s+(-[a-zA-Z]*r[a-zA-Z]*\s+)?(-[a-zA-Z]*f[a-zA-Z]*\s+)?\/\s*$/,
  /\brm\s+-[a-zA-Z]*rf\s+\/\s*$/,
  /\brm\s+-rf\s+\/(?:\s|$)/,
  /\brm\s+-rf\s+~\//,
  /\bmkfs\b/,
  /\bdd\s+if=\/dev\/zero/,
  /:\(\)\{\s*:\|:&\s*\};:/,
  /\b>\s*\/dev\/sda/,
  /\bchmod\s+-R\s+777\s+\//,
  /\bchown\s+-R\s+.*\s+\/\s*$/,
];

function isDangerous(command: string): string | null {
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(command)) {
      return `Blocked: command matches dangerous pattern ${pattern.source}`;
    }
  }
  return null;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS = 120_000;
/** Floor so a tiny/zero `timeout` can't kill the command before it starts. */
const MIN_TIMEOUT_MS = 1_000;

export async function runCommand(args: {
  command: string;
  cwd?: string;
  timeout?: number;
}): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const blocked = isDangerous(args.command);
  if (blocked) {
    return { stdout: "", stderr: blocked, exitCode: 1 };
  }

  const timeoutMs = Math.min(
    Math.max(
      MIN_TIMEOUT_MS,
      (args.timeout ?? DEFAULT_TIMEOUT_MS / 1000) * 1000,
    ),
    MAX_TIMEOUT_MS,
  );

  const isWin = process.platform === "win32";
  const shell = isWin ? "cmd" : "sh";
  const shellArgs = isWin ? ["/c", args.command] : ["-c", args.command];

  try {
    const { stdout, stderr } = await execFileP(shell, shellArgs, {
      cwd: args.cwd ?? process.cwd(),
      timeout: timeoutMs,
      maxBuffer: 1024 * 1024,
      env: process.env,
    });
    return { stdout, stderr, exitCode: 0 };
  } catch (err: unknown) {
    const e = err as {
      stdout?: string;
      stderr?: string;
      code?: number | string;
    };
    const exitCode =
      typeof e.code === "number"
        ? e.code
        : e.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER"
          ? 1
          : 1;
    return {
      stdout: e.stdout ?? "",
      stderr: e.stderr ?? String(err),
      exitCode,
    };
  }
}
