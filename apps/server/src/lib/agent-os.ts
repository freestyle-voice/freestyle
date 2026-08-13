import { exec } from "node:child_process";
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

export function resolveAgentPath(input: string): { full: string } {
  const full = path.isAbsolute(input)
    ? path.resolve(input)
    : path.resolve(homedir(), input);
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
  writeFileSync(full, raw.replace(oldText, newText));
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

export function runAgentBash(command: string): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number;
  truncated: boolean;
  timedOut: boolean;
}> {
  return new Promise((resolve) => {
    exec(
      command,
      {
        cwd: homedir(),
        timeout: BASH_TIMEOUT_MS,
        maxBuffer: 4 * 1024 * 1024,
        shell: process.env.SHELL || "/bin/sh",
      },
      (err, stdout, stderr) => {
        const timedOut = !!err && (err as { killed?: boolean }).killed === true;
        const code =
          err && typeof (err as { code?: number }).code === "number"
            ? ((err as { code?: number }).code as number)
            : err
              ? 1
              : 0;
        resolve({
          stdout: stdout.slice(0, BASH_OUTPUT_CAP),
          stderr: stderr.slice(0, BASH_OUTPUT_CAP),
          exitCode: timedOut ? 124 : code,
          truncated:
            stdout.length > BASH_OUTPUT_CAP || stderr.length > BASH_OUTPUT_CAP,
          timedOut,
        });
      },
    );
  });
}
