import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

export const IS_MACOS = process.platform === "darwin";

export async function runShortcut(args: {
  name: string;
  input?: string;
}): Promise<string> {
  if (!IS_MACOS) {
    return "Error: macOS Shortcuts are only available on macOS.";
  }

  try {
    if (args.input) {
      // Pipe input to the shortcut via stdin
      const output = await pipeToShortcut(args.name, args.input);
      return output || `Shortcut "${args.name}" completed with no output.`;
    }

    const { stdout } = await execFileP("shortcuts", ["run", args.name], {
      timeout: 30_000,
    });
    return stdout.trim() || `Shortcut "${args.name}" completed with no output.`;
  } catch (err) {
    return `Failed to run shortcut "${args.name}": ${
      err instanceof Error ? err.message : String(err)
    }`;
  }
}

function pipeToShortcut(name: string, input: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("shortcuts", ["run", name, "-i", "-"], {
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 30_000,
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d: Buffer) => {
      stdout += d.toString();
    });
    child.stderr.on("data", (d: Buffer) => {
      stderr += d.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(stderr.trim() || `Exited with code ${code}`));
    });
    child.stdin.end(input);
  });
}
