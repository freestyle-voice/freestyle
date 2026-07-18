import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pipeToCommand } from "./util.js";

const execFileP = promisify(execFile);

export async function openUrl(args: { url: string }): Promise<string> {
  const { url } = args;
  const plat = process.platform;

  try {
    if (plat === "darwin") {
      await execFileP("open", [url], { timeout: 5000 });
    } else if (plat === "win32") {
      await execFileP("cmd", ["/c", "start", "", url], { timeout: 5000 });
    } else {
      await execFileP("xdg-open", [url], { timeout: 5000 });
    }
    return `Opened ${url}`;
  } catch (err) {
    return `Failed to open ${url}: ${err instanceof Error ? err.message : String(err)}`;
  }
}

export async function getClipboard(): Promise<string> {
  const plat = process.platform;

  try {
    if (plat === "darwin") {
      const { stdout } = await execFileP("pbpaste", [], { timeout: 3000 });
      return stdout;
    }
    if (plat === "win32") {
      const { stdout } = await execFileP(
        "powershell",
        ["-NoProfile", "-Command", "Get-Clipboard"],
        { timeout: 3000 },
      );
      return stdout.trim();
    }
    // Linux — try xclip, then xsel, then wl-paste
    for (const [cmd, cmdArgs] of [
      ["xclip", ["-selection", "clipboard", "-o"]],
      ["xsel", ["--clipboard", "--output"]],
      ["wl-paste", []],
    ] as [string, string[]][]) {
      try {
        const { stdout } = await execFileP(cmd, cmdArgs, { timeout: 3000 });
        return stdout;
      } catch {}
    }
    return "Error: no clipboard tool found (install xclip, xsel, or wl-paste)";
  } catch (err) {
    return `Error reading clipboard: ${err instanceof Error ? err.message : String(err)}`;
  }
}

export async function setClipboard(args: { text: string }): Promise<string> {
  const plat = process.platform;

  try {
    if (plat === "darwin") {
      await pipeToCommand("pbcopy", [], args.text);
      return "Copied to clipboard.";
    }
    if (plat === "win32") {
      await pipeToCommand(
        "powershell",
        ["-NoProfile", "-Command", "Set-Clipboard -Value $input"],
        args.text,
      );
      return "Copied to clipboard.";
    }
    // Linux
    for (const [cmd, cmdArgs] of [
      ["xclip", ["-selection", "clipboard"]],
      ["xsel", ["--clipboard", "--input"]],
      ["wl-copy", []],
    ] as [string, string[]][]) {
      try {
        await pipeToCommand(cmd, cmdArgs, args.text);
        return "Copied to clipboard.";
      } catch {}
    }
    return "Error: no clipboard tool found (install xclip, xsel, or wl-copy)";
  } catch (err) {
    return `Error writing clipboard: ${err instanceof Error ? err.message : String(err)}`;
  }
}
