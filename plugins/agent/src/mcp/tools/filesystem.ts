import { execFile } from "node:child_process";
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

export function readFile(args: {
  path: string;
  offset?: number;
  limit?: number;
}): string {
  const resolved = resolve(args.path);
  const raw = readFileSync(resolved, "utf-8");
  const lines = raw.split("\n");

  const start = Math.max(0, (args.offset ?? 1) - 1);
  const end = args.limit ? start + args.limit : lines.length;
  const slice = lines.slice(start, end);

  return slice.map((line, i) => `${start + i + 1}: ${line}`).join("\n");
}

export function writeFile(args: { path: string; content: string }): string {
  const resolved = resolve(args.path);
  mkdirSync(dirname(resolved), { recursive: true });
  writeFileSync(resolved, args.content, "utf-8");
  return `Wrote ${Buffer.byteLength(args.content, "utf-8")} bytes to ${resolved}`;
}

export interface DirEntry {
  name: string;
  type: "file" | "directory" | "symlink" | "other";
  size: number;
}

export function listDirectory(args: { path: string }): DirEntry[] {
  const resolved = resolve(args.path);
  const entries = readdirSync(resolved, { withFileTypes: true });

  return entries.map((e) => {
    let size = 0;
    try {
      if (e.isFile()) size = statSync(resolve(resolved, e.name)).size;
    } catch {}

    let type: DirEntry["type"] = "other";
    if (e.isFile()) type = "file";
    else if (e.isDirectory()) type = "directory";
    else if (e.isSymbolicLink()) type = "symlink";

    return { name: e.name, type, size };
  });
}

export async function searchFiles(args: {
  pattern: string;
  path?: string;
  include?: string;
}): Promise<string> {
  const cwd = args.path ? resolve(args.path) : process.cwd();

  const grepArgs = ["-rn", "--max-count=100"];
  if (args.include) grepArgs.push("--include", args.include);
  grepArgs.push(args.pattern, ".");

  try {
    const { stdout } = await execFileP("grep", grepArgs, {
      cwd,
      timeout: 15_000,
      maxBuffer: 1024 * 512,
    });
    return stdout.trim() || "No matches found.";
  } catch (err: unknown) {
    const e = err as { code?: number; stdout?: string };
    if (e.code === 1) return "No matches found.";
    throw err;
  }
}
