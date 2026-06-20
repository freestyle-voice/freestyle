import { execFile, spawn } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import { access } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { createAppLogger } from "@freestyle/utils";
import type { AgentCliStatus } from "@freestyle/validations";

const log = createAppLogger("agent-cli");
const execFileP = promisify(execFile);

const COMMON_BIN_DIRS = [
  "/opt/homebrew/bin",
  "/usr/local/bin",
  "/usr/bin",
  join(homedir(), ".npm-global", "bin"),
  join(homedir(), ".local", "bin"),
  join(homedir(), ".bun", "bin"),
  join(homedir(), ".volta", "bin"),
];

async function resolveClaudePath(): Promise<string | null> {
  if (process.platform === "win32") {
    try {
      const { stdout } = await execFileP("where", ["claude"], {
        timeout: 5000,
      });
      const first = stdout
        .split(/\r?\n/)
        .map((s) => s.trim())
        .find(Boolean);
      return first ?? null;
    } catch {
      return null;
    }
  }

  const shell = process.env.SHELL || "/bin/zsh";
  try {
    const { stdout } = await execFileP(shell, ["-lic", "command -v claude"], {
      timeout: 5000,
    });
    const path = stdout
      .split(/\r?\n/)
      .map((s) => s.trim())
      .find((s) => s?.startsWith("/"));
    if (path) return path;
  } catch {}

  for (const dir of COMMON_BIN_DIRS) {
    const candidate = join(dir, "claude");
    try {
      await access(candidate, fsConstants.X_OK);
      return candidate;
    } catch {}
  }
  return null;
}

function parseVersion(out: string): string | null {
  const m = out.match(/\d+\.\d+\.\d+/);
  return m ? m[0] : null;
}

export async function detectClaudeCli(): Promise<AgentCliStatus> {
  const path = await resolveClaudePath();
  if (!path) return { installed: false, version: null, path: null };
  try {
    const { stdout } = await execFileP(path, ["--version"], { timeout: 5000 });
    return { installed: true, version: parseVersion(stdout), path };
  } catch (err) {
    log.warn(`claude --version failed at ${path}: ${String(err)}`);
    return { installed: true, version: null, path };
  }
}

export function runClaudeLogin(
  onOutput: (chunk: string) => void,
): Promise<{ ok: boolean; code: number | null }> {
  return new Promise((resolve) => {
    void (async () => {
      const path = await resolveClaudePath();
      if (!path) {
        onOutput("Claude Code CLI not found. Install it, then try again.\n");
        resolve({ ok: false, code: null });
        return;
      }
      const child = spawn(path, ["login"], { env: { ...process.env } });
      child.stdout?.on("data", (d: Buffer) => onOutput(d.toString()));
      child.stderr?.on("data", (d: Buffer) => onOutput(d.toString()));
      child.on("error", (e) => {
        onOutput(`Failed to start login: ${e.message}\n`);
        resolve({ ok: false, code: null });
      });
      child.on("close", (code) => resolve({ ok: code === 0, code }));
    })();
  });
}

export function openTerminalLogin(): void {
  try {
    if (process.platform === "darwin") {
      spawn("osascript", [
        "-e",
        'tell application "Terminal" to activate',
        "-e",
        'tell application "Terminal" to do script "claude login"',
      ]);
      return;
    }
    if (process.platform === "win32") {
      spawn("cmd", ["/c", "start", "cmd", "/k", "claude login"], {
        windowsHide: false,
      });
      return;
    }
    const inner = "claude login; exec $SHELL";
    const candidates = [
      process.env.TERMINAL,
      "x-terminal-emulator",
      "gnome-terminal",
      "konsole",
      "xterm",
    ].filter((t): t is string => !!t);
    for (const term of candidates) {
      try {
        spawn(term, ["-e", `sh -c '${inner}'`]);
        return;
      } catch {}
    }
    log.warn("No terminal emulator found to launch `claude login`");
  } catch (err) {
    log.warn(`openTerminalLogin failed: ${String(err)}`);
  }
}
