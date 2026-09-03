import { exec, execFile } from "node:child_process";
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const FILE_MAX_CHARS = 60_000;
const BASH_TIMEOUT_MS = 30_000;
const BASH_OUTPUT_CAP = 8_192;
const WALK_MAX_ENTRIES = 1_000;
const GREP_MAX_MATCHES = 60;
const GREP_FILE_MAX_BYTES = 262_144;
const SKIP_DIRS = new Set(["node_modules", ".git", ".Trash", "Library"]);
const WINDOWS_SHELLS = ["pwsh.exe", "powershell.exe"] as const;

export type AgentCommandCategory =
  | "success"
  | "shell-unavailable"
  | "command-failed"
  | "permission-denied"
  | "not-found"
  | "timed-out";

export interface AgentCommandResult {
  ok: boolean;
  category: AgentCommandCategory;
  reason?: AgentCommandCategory;
  stdout: string;
  stderr: string;
  exitCode: number;
  truncated: boolean;
  timedOut: boolean;
}

type AgentCommandError = NodeJS.ErrnoException & {
  killed?: boolean;
  signal?: string;
};
type AgentCommandCallback = (
  error: AgentCommandError | null,
  stdout: string,
  stderr: string,
) => void;
type ShellExecutor = (
  command: string,
  options: {
    cwd: string;
    timeout: number;
    maxBuffer: number;
    shell: string;
  },
  callback: AgentCommandCallback,
) => unknown;
type FileExecutor = (
  file: string,
  args: string[],
  options: { cwd: string; timeout: number; maxBuffer: number },
  callback: AgentCommandCallback,
) => unknown;

export interface AgentCommandOptions {
  platform?: NodeJS.Platform;
  exec?: ShellExecutor;
  execFile?: FileExecutor;
}

function powerShellCommand(command: string): string {
  // A native executable's failure only updates `$LASTEXITCODE`; PowerShell
  // itself otherwise exits successfully (or with the generic code 1). Carry
  // that status through so the agent gets the actual Windows command result.
  return `$ErrorActionPreference = 'Stop'; & { ${command} }; if ($null -ne $LASTEXITCODE) { exit $LASTEXITCODE }; exit 0`;
}

export function resolveAgentPath(input: string): { full: string } {
  const expanded =
    input === "~"
      ? homedir()
      : input.startsWith("~/") || input.startsWith("~\\")
        ? path.join(homedir(), input.slice(2))
        : input;
  const full = path.isAbsolute(expanded)
    ? path.resolve(expanded)
    : path.resolve(homedir(), expanded);
  return { full };
}

export function readAgentFile(
  input: string,
  offset?: number,
  limit?: number,
): { text: string; truncated: boolean; totalLines: number } {
  const { full } = resolveAgentPath(input);
  const raw = readFileSync(full, "utf8");
  const lines = raw.split("\n");
  const start = Math.max(0, (offset ?? 1) - 1);
  const count = limit && limit > 0 ? limit : lines.length;
  const slice = lines.slice(start, start + count).join("\n");
  return {
    text: slice.slice(0, FILE_MAX_CHARS),
    truncated: slice.length > FILE_MAX_CHARS || start + count < lines.length,
    totalLines: lines.length,
  };
}

export function writeAgentFile(input: string, text: string): void {
  const { full } = resolveAgentPath(input);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, text);
}

export function editAgentFile(
  input: string,
  oldText: string,
  newText: string,
): "ok" | "not-found" | "ambiguous" {
  const { full } = resolveAgentPath(input);
  const raw = readFileSync(full, "utf8");
  const first = raw.indexOf(oldText);
  if (first === -1) return "not-found";
  if (raw.indexOf(oldText, first + 1) !== -1) return "ambiguous";
  writeFileSync(
    full,
    raw.slice(0, first) + newText + raw.slice(first + oldText.length),
  );
  return "ok";
}

function walkAny(
  dir: string,
  base: string,
  out: Array<{ path: string; size: number; modified: number }>,
): void {
  if (out.length >= WALK_MAX_ENTRIES) return;
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries.sort()) {
    if (name.startsWith(".") || SKIP_DIRS.has(name)) continue;
    const full = path.join(dir, name);
    let st: ReturnType<typeof statSync>;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      walkAny(full, base, out);
    } else {
      if (out.length >= WALK_MAX_ENTRIES) return;
      out.push({
        path: path.relative(base, full),
        size: st.size,
        modified: st.mtimeMs,
      });
    }
  }
}

function globToRegExp(pattern: string): RegExp {
  let out = "";
  let i = 0;
  while (i < pattern.length) {
    if (pattern.startsWith("**/", i)) {
      out += "(?:.*/)?";
      i += 3;
    } else if (pattern.startsWith("**", i)) {
      out += ".*";
      i += 2;
    } else if (pattern[i] === "*") {
      out += "[^/]*";
      i += 1;
    } else if (pattern[i] === "?") {
      out += "[^/]";
      i += 1;
    } else {
      out += pattern[i].replace(/[.+^${}()|[\]\\]/g, "\\$&");
      i += 1;
    }
  }
  return new RegExp(`^${out}$`);
}

export function globAgentFiles(
  pattern: string,
  root?: string,
): Array<{ path: string; size: number; modified: number }> {
  const { full } = resolveAgentPath(root ?? ".");
  const out: Array<{ path: string; size: number; modified: number }> = [];
  walkAny(full, full, out);
  const re = globToRegExp(pattern);
  return out
    .map((f) => ({ ...f, path: f.path.replace(/\\/g, "/") }))
    .filter((f) => re.test(f.path))
    .slice(0, 200);
}

export function grepAgentFiles(
  query: string,
  root?: string,
): Array<{ path: string; line: number; text: string }> {
  const { full } = resolveAgentPath(root ?? ".");
  let re: RegExp;
  try {
    re = new RegExp(query, "i");
  } catch {
    re = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  }
  const files: Array<{ path: string; size: number; modified: number }> = [];
  walkAny(full, full, files);
  const matches: Array<{ path: string; line: number; text: string }> = [];
  for (const f of files) {
    if (matches.length >= GREP_MAX_MATCHES) break;
    if (f.size > GREP_FILE_MAX_BYTES) continue;
    let raw: string;
    try {
      raw = readFileSync(path.join(full, f.path), "utf8");
    } catch {
      continue;
    }
    if (raw.includes("\u0000")) continue;
    const lines = raw.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (re.test(lines[i])) {
        matches.push({
          path: f.path.replace(/\\/g, "/"),
          line: i + 1,
          text: lines[i].slice(0, 300),
        });
        if (matches.length >= GREP_MAX_MATCHES) break;
      }
    }
  }
  return matches;
}

export function runAgentBash(
  command: string,
  options: AgentCommandOptions = {},
): Promise<AgentCommandResult> {
  return new Promise((resolve) => {
    const platform = options.platform ?? process.platform;
    const complete: AgentCommandCallback = (err, stdout, stderr) => {
      const timedOut =
        !!err &&
        (err.code === "ETIMEDOUT" ||
          (err.killed === true && !/maxBuffer/i.test(err.message)));
      const errorCode = err?.code;
      const category: AgentCommandCategory = !err
        ? "success"
        : timedOut
          ? "timed-out"
          : errorCode === "ENOENT"
            ? platform === "win32"
              ? "shell-unavailable"
              : "not-found"
            : errorCode === "EACCES" || errorCode === "EPERM"
              ? "permission-denied"
              : "command-failed";
      const exitCode = !err
        ? 0
        : timedOut
          ? 124
          : typeof errorCode === "number"
            ? errorCode
            : 1;
      resolve({
        ok: !err,
        category,
        ...(err ? { reason: category } : {}),
        stdout: stdout.slice(0, BASH_OUTPUT_CAP),
        stderr: stderr.slice(0, BASH_OUTPUT_CAP),
        exitCode,
        truncated:
          stdout.length > BASH_OUTPUT_CAP || stderr.length > BASH_OUTPUT_CAP,
        timedOut,
      });
    };
    const common = {
      cwd: homedir(),
      timeout: BASH_TIMEOUT_MS,
      maxBuffer: 4 * 1024 * 1024,
    };

    if (platform === "win32") {
      const run = (options.execFile ?? execFile) as FileExecutor;
      const runPowerShell = (shellIndex: number): void => {
        run(
          WINDOWS_SHELLS[shellIndex],
          [
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            powerShellCommand(command),
          ],
          common,
          (err, stdout, stderr) => {
            // PowerShell 7 is more reliable for non-interactive desktop work
            // (and is what our Windows CI uses), but Windows PowerShell remains
            // the compatibility fallback for machines without pwsh.
            if (
              err?.code === "ENOENT" &&
              shellIndex < WINDOWS_SHELLS.length - 1
            ) {
              runPowerShell(shellIndex + 1);
              return;
            }
            complete(err, stdout, stderr);
          },
        );
      };
      runPowerShell(0);
      return;
    }

    const run = (options.exec ?? exec) as ShellExecutor;
    run(
      command,
      { ...common, shell: process.env.SHELL || "/bin/sh" },
      complete,
    );
  });
}
