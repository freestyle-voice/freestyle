import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { setFreestyleVisible } from "./screenshot.js";

const execFileP = promisify(execFile);

export interface FrontmostAppInfo {
  app: string;
  title?: string;
  url?: string;
}

export async function getFrontmostApp(): Promise<FrontmostAppInfo> {
  const plat = process.platform;

  if (plat === "darwin") return getMacFrontmostApp();
  if (plat === "win32") return getWindowsFrontmostApp();
  return getLinuxFrontmostApp();
}

async function getMacFrontmostApp(): Promise<FrontmostAppInfo> {
  try {
    const script = `
      tell application "System Events"
        set frontApp to name of first application process whose frontmost is true
      end tell
      return frontApp
    `;
    const { stdout: app } = await execFileP("osascript", ["-e", script], {
      timeout: 3000,
    });
    const appName = app.trim();
    const result: FrontmostAppInfo = { app: appName };

    // Try to get browser tab info for common browsers
    const browsers: Record<string, string> = {
      "Google Chrome": "Google Chrome",
      Safari: "Safari",
      Firefox: "Firefox",
      Arc: "Arc",
      "Brave Browser": "Brave Browser",
      "Microsoft Edge": "Microsoft Edge",
    };

    const browserScript = browsers[appName];
    if (browserScript) {
      try {
        const urlScript =
          appName === "Firefox"
            ? `tell application "${browserScript}" to get name of front window`
            : `tell application "${browserScript}" to get {URL, title} of active tab of front window`;
        const { stdout } = await execFileP("osascript", ["-e", urlScript], {
          timeout: 2000,
        });
        const parts = stdout.trim().split(", ");
        if (appName === "Firefox") {
          result.title = parts[0];
        } else {
          if (parts[0]) result.url = parts[0];
          if (parts[1]) result.title = parts[1];
        }
      } catch {}
    }

    return result;
  } catch {
    return { app: "unknown" };
  }
}

async function getWindowsFrontmostApp(): Promise<FrontmostAppInfo> {
  try {
    const script = `
      Add-Type @"
        using System;
        using System.Runtime.InteropServices;
        public class Win {
          [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
          [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, System.Text.StringBuilder s, int c);
          [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint p);
        }
"@
      $h = [Win]::GetForegroundWindow()
      $sb = New-Object System.Text.StringBuilder 256
      [Win]::GetWindowText($h, $sb, 256) | Out-Null
      $pid = 0; [Win]::GetWindowThreadProcessId($h, [ref]$pid) | Out-Null
      $proc = Get-Process -Id $pid -ErrorAction SilentlyContinue
      "$($proc.ProcessName)|$($sb.ToString())"
    `;
    const { stdout } = await execFileP(
      "powershell",
      ["-NoProfile", "-Command", script],
      { timeout: 5000 },
    );
    const [app, title] = stdout.trim().split("|");
    return { app: app || "unknown", title: title || undefined };
  } catch {
    return { app: "unknown" };
  }
}

async function getLinuxFrontmostApp(): Promise<FrontmostAppInfo> {
  // Try xdotool (X11)
  try {
    await execFileP("xdotool", ["getactivewindow"], {
      timeout: 2000,
    });
    const { stdout: name } = await execFileP(
      "xdotool",
      ["getactivewindow", "getwindowname"],
      { timeout: 2000 },
    );
    const { stdout: pid } = await execFileP(
      "xdotool",
      ["getactivewindow", "getwindowpid"],
      { timeout: 2000 },
    );

    let app = "unknown";
    try {
      const { stdout: comm } = await execFileP(
        "cat",
        [`/proc/${pid.trim()}/comm`],
        { timeout: 1000 },
      );
      app = comm.trim();
    } catch {}

    return { app, title: name.trim() || undefined };
  } catch {}

  // Try swaymsg (Wayland/Sway)
  try {
    const { stdout } = await execFileP("swaymsg", ["-t", "get_tree"], {
      timeout: 2000,
    });
    const tree = JSON.parse(stdout);
    const focused = findFocused(tree);
    if (focused) {
      return {
        app: String(focused.app_id || focused.name || "unknown"),
        title: focused.name ? String(focused.name) : undefined,
      };
    }
  } catch {}

  return { app: "unknown" };
}

function findFocused(
  node: Record<string, unknown>,
): Record<string, unknown> | null {
  if (node.focused) return node;
  const nodes = [
    ...((node.nodes as Record<string, unknown>[]) ?? []),
    ...((node.floating_nodes as Record<string, unknown>[]) ?? []),
  ];
  for (const child of nodes) {
    const result = findFocused(child);
    if (result) return result;
  }
  return null;
}

export async function pasteText(args: { text: string }): Promise<string> {
  const plat = process.platform;

  try {
    if (plat === "darwin") return await pasteMac(args.text);
    if (plat === "win32") return await pasteWindows(args.text);
    return await pasteLinux(args.text);
  } catch (err) {
    return `Failed to paste: ${err instanceof Error ? err.message : String(err)}`;
  }
}

/**
 * macOS-specific paste: hides the Freestyle window so it doesn't steal
 * focus, identifies the previously-frontmost app, activates it, writes
 * to the clipboard, simulates Cmd+V, then restores the Freestyle window.
 */
async function pasteMac(text: string): Promise<string> {
  // Determine the frontmost app BEFORE hiding Freestyle
  let targetApp = "";
  try {
    const { stdout } = await execFileP(
      "osascript",
      [
        "-e",
        'tell application "System Events" to get name of first application process whose frontmost is true',
      ],
      { timeout: 2000 },
    );
    targetApp = stdout.trim();
  } catch {}

  // If Freestyle itself is frontmost, find the next app
  if (targetApp === "Freestyle" || !targetApp) {
    try {
      const { stdout } = await execFileP(
        "osascript",
        [
          "-e",
          'tell application "System Events" to get name of every application process whose visible is true and frontmost is false',
        ],
        { timeout: 2000 },
      );
      const apps = stdout.trim().split(", ").filter(Boolean);
      targetApp = apps[0] || "";
    } catch {}
  }

  // Hide Freestyle so the target app regains focus
  try {
    await execFileP(
      "osascript",
      [
        "-e",
        'tell application "System Events" to set visible of process "Freestyle" to false',
      ],
      { timeout: 2000 },
    );
  } catch {}

  await sleep(150);

  // Activate the target app
  if (targetApp) {
    try {
      await execFileP(
        "osascript",
        ["-e", `tell application "${targetApp}" to activate`],
        { timeout: 2000 },
      );
      await sleep(200);
    } catch {}
  }

  // Write to clipboard and simulate Cmd+V
  await pipeToCommand("pbcopy", [], text);
  await sleep(50);

  await execFileP(
    "osascript",
    [
      "-e",
      'tell application "System Events" to keystroke "v" using command down',
    ],
    { timeout: 3000 },
  );

  await sleep(300);

  // Restore Freestyle visibility
  try {
    await execFileP(
      "osascript",
      [
        "-e",
        'tell application "System Events" to set visible of process "Freestyle" to true',
      ],
      { timeout: 2000 },
    );
  } catch {}

  return `Pasted ${text.length} characters into ${targetApp || "the focused app"}.`;
}

/**
 * Windows-specific paste: hides Freestyle, writes to clipboard via
 * PowerShell, simulates Ctrl+V, then restores Freestyle.
 */
async function pasteWindows(text: string): Promise<string> {
  // Hide Freestyle so the target app can receive focus
  await setFreestyleVisible(false);
  await sleep(200);

  try {
    // Write to clipboard and simulate Ctrl+V in one PowerShell session
    const script = `
      Set-Clipboard -Value $args[0]
      Start-Sleep -Milliseconds 50
      Add-Type -A System.Windows.Forms
      [System.Windows.Forms.SendKeys]::SendWait('^v')
    `;
    await execFileP("powershell", ["-NoProfile", "-Command", script, text], {
      timeout: 5000,
    });

    await sleep(300);
    return `Pasted ${text.length} characters into the focused app.`;
  } finally {
    await setFreestyleVisible(true);
  }
}

/**
 * Linux-specific paste: hides Freestyle, writes to clipboard, simulates
 * Ctrl+V via xdotool or wtype, then restores Freestyle.
 */
async function pasteLinux(text: string): Promise<string> {
  // Hide Freestyle
  await setFreestyleVisible(false);
  await sleep(200);

  try {
    // Write to clipboard
    let clipOk = false;
    for (const [cmd, cmdArgs] of [
      ["xclip", ["-selection", "clipboard"]],
      ["xsel", ["--clipboard", "--input"]],
      ["wl-copy", []],
    ] as [string, string[]][]) {
      try {
        await pipeToCommand(cmd, cmdArgs, text);
        clipOk = true;
        break;
      } catch {}
    }
    if (!clipOk)
      return "Error: no clipboard tool found (install xclip, xsel, or wl-copy)";

    await sleep(50);

    // Simulate Ctrl+V
    try {
      await execFileP("xdotool", ["key", "ctrl+v"], { timeout: 2000 });
    } catch {
      try {
        await execFileP("wtype", ["-M", "ctrl", "-k", "v"], { timeout: 2000 });
      } catch {
        return "Error: could not simulate paste (install xdotool or wtype)";
      }
    }

    await sleep(300);
    return `Pasted ${text.length} characters into the focused app.`;
  } finally {
    await setFreestyleVisible(true);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function pipeToCommand(
  cmd: string,
  args: string[],
  input: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["pipe", "ignore", "ignore"] });
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`)),
    );
    child.stdin.end(input);
  });
}
