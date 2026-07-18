import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

const IS_MAC = process.platform === "darwin";
const IS_WIN = process.platform === "win32";

const OSASCRIPT = "/usr/bin/osascript";

function run(cmd: string, args: string[], timeoutMs = 15_000): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      cmd,
      args,
      { encoding: "utf-8", timeout: timeoutMs },
      (err, stdout) => {
        if (err) reject(err);
        else resolve(String(stdout).trim());
      },
    );
  });
}

// ---- cliclick discovery (macOS) ------------------------------------------

let cliclickPath: string | null | undefined;

async function findCliclick(): Promise<string | null> {
  if (cliclickPath !== undefined) return cliclickPath;
  const candidates = [
    "/opt/homebrew/bin/cliclick",
    "/usr/local/bin/cliclick",
    "cliclick",
  ];
  for (const p of candidates) {
    try {
      await run(p, ["-V"], 4000);
      cliclickPath = p;
      return p;
    } catch {
      // try next
    }
  }
  cliclickPath = null;
  return null;
}

async function cliclick(args: string[]): Promise<void> {
  const path = await findCliclick();
  if (!path)
    throw new Error("cliclick not found — install via: brew install cliclick");
  await run(path, args);
}

// ---- key chords → AppleScript System Events ------------------------------

const MOD_MAP: Record<string, string> = {
  cmd: "command down",
  command: "command down",
  ctrl: "control down",
  control: "control down",
  alt: "option down",
  option: "option down",
  opt: "option down",
  shift: "shift down",
};

const APPLE_KEY_CODES: Record<string, number> = {
  return: 36,
  enter: 76,
  esc: 53,
  escape: 53,
  tab: 48,
  space: 49,
  delete: 51,
  backspace: 51,
  del: 51,
  "fwd-delete": 117,
  fwddelete: 117,
  forwarddelete: 117,
  up: 126,
  "arrow-up": 126,
  down: 125,
  "arrow-down": 125,
  left: 123,
  "arrow-left": 123,
  right: 124,
  "arrow-right": 124,
  home: 115,
  end: 119,
  pageup: 116,
  "page-up": 116,
  pagedown: 121,
  "page-down": 121,
  f1: 122,
  f2: 120,
  f3: 99,
  f4: 118,
  f5: 96,
  f6: 97,
  f7: 98,
  f8: 100,
  f9: 101,
  f10: 109,
  f11: 103,
  f12: 111,
};

function buildKeystrokeScript(chord: string): string {
  const parts = chord
    .split("+")
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);
  if (parts.length === 0) throw new Error("empty key chord");
  const key = parts[parts.length - 1];
  const mods = parts.slice(0, -1).map((m) => {
    const apple = MOD_MAP[m];
    if (!apple) throw new Error(`unsupported modifier: ${m}`);
    return apple;
  });

  let action: string;
  if (key.length === 1) {
    const esc = key.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    action = `keystroke "${esc}"`;
  } else {
    const code = APPLE_KEY_CODES[key];
    if (code === undefined) throw new Error(`unknown key: ${key}`);
    action = `key code ${code}`;
  }

  const using = mods.length ? ` using {${mods.join(", ")}}` : "";
  return `tell application "System Events" to ${action}${using}`;
}

// ---- Screen geometry (logical pixels) ------------------------------------

async function getScreenSize(): Promise<{ width: number; height: number }> {
  if (IS_MAC) {
    try {
      const { stdout } = await execFileP(
        "osascript",
        ["-e", 'tell application "Finder" to get bounds of window of desktop'],
        { timeout: 3000 },
      );
      const parts = stdout.trim().split(", ");
      if (parts.length === 4) {
        return {
          width: Number(parts[2]),
          height: Number(parts[3]),
        };
      }
    } catch {}
    // Fallback: use system_profiler
    try {
      const script = [
        'use framework "AppKit"',
        "set mainScreen to current application's NSScreen's mainScreen()",
        "set f to mainScreen's frame()",
        "return ((f's |size|'s width) as integer as text) & \",\" & ((f's |size|'s height) as integer as text)",
      ].join("\n");
      const { stdout } = await execFileP("osascript", ["-e", script], {
        timeout: 3000,
      });
      const [w, h] = stdout.trim().split(",").map(Number);
      if (w && h) return { width: w, height: h };
    } catch {}
  }
  // Default fallback
  return { width: 1920, height: 1080 };
}

function clamp(val: number, max: number): number {
  return Math.max(0, Math.min(max - 1, Math.round(val)));
}

// ---- Desktop actions -----------------------------------------------------

export type MouseButton = "left" | "right";

/**
 * Guidance event emitted instead of real actuation in guided mode. The pill
 * panel renders these as a ghost cursor overlay.
 */
export interface GuidanceEvent {
  kind:
    | "move"
    | "click"
    | "right_click"
    | "double_click"
    | "type"
    | "key"
    | "clear";
  x?: number;
  y?: number;
  caption?: string;
  text?: string;
}

export type ComputerUseMode = "full" | "guided";

export async function moveCursor(
  x: number,
  y: number,
  mode: ComputerUseMode,
  onGuidance?: (e: GuidanceEvent) => void,
  note?: string,
): Promise<string> {
  const { width, height } = await getScreenSize();
  const cx = clamp(x, width);
  const cy = clamp(y, height);
  const at = `(${cx}, ${cy})`;

  if (mode === "guided") {
    onGuidance?.({ kind: "move", x: cx, y: cy, caption: note });
    return `Pointed the user to ${at}. The user performs it — take a screenshot to verify before the next step.`;
  }

  if (IS_MAC) {
    await cliclick([`m:${cx},${cy}`]);
  } else if (IS_WIN) {
    await execFileP(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        `Add-Type -A System.Windows.Forms; [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${cx},${cy})`,
      ],
      { timeout: 5000 },
    );
  } else {
    await execFileP("xdotool", ["mousemove", String(cx), String(cy)], {
      timeout: 5000,
    });
  }
  return `moved to ${at}`;
}

export async function clickMouse(
  x: number,
  y: number,
  button: MouseButton,
  mode: ComputerUseMode,
  onGuidance?: (e: GuidanceEvent) => void,
  note?: string,
): Promise<string> {
  const { width, height } = await getScreenSize();
  const cx = clamp(x, width);
  const cy = clamp(y, height);
  const at = `(${cx}, ${cy})`;
  const kind = button === "right" ? "right_click" : "click";
  const label = button === "right" ? "right-click" : "left-click";

  if (mode === "guided") {
    onGuidance?.({ kind, x: cx, y: cy, caption: note });
    return `Pointed the user to ${label} ${at}. The user performs it — take a screenshot to verify before the next step.`;
  }

  if (IS_MAC) {
    const verb = button === "right" ? "rc" : "c";
    await cliclick([`${verb}:${cx},${cy}`]);
  } else if (IS_WIN) {
    const down = button === "right" ? "0x0008" : "0x0002";
    const up = button === "right" ? "0x0010" : "0x0004";
    const script = `
Add-Type @"
using System; using System.Runtime.InteropServices;
public class Mouse {
  [DllImport("user32.dll")] public static extern void SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, int x, int y, uint d, int e);
}
"@
[Mouse]::SetCursorPos(${cx}, ${cy})
Start-Sleep -Milliseconds 50
[Mouse]::mouse_event(${down}, 0, 0, 0, 0); [Mouse]::mouse_event(${up}, 0, 0, 0, 0)
`;
    await execFileP("powershell", ["-NoProfile", "-Command", script], {
      timeout: 5000,
    });
  } else {
    const btn = button === "right" ? "3" : "1";
    await execFileP(
      "xdotool",
      ["mousemove", String(cx), String(cy), "click", btn],
      { timeout: 5000 },
    );
  }
  return `${label}ed ${at}`;
}

export async function doubleClick(
  x: number,
  y: number,
  mode: ComputerUseMode,
  onGuidance?: (e: GuidanceEvent) => void,
  note?: string,
): Promise<string> {
  const { width, height } = await getScreenSize();
  const cx = clamp(x, width);
  const cy = clamp(y, height);
  const at = `(${cx}, ${cy})`;

  if (mode === "guided") {
    onGuidance?.({ kind: "double_click", x: cx, y: cy, caption: note });
    return `Pointed the user to double-click ${at}. The user performs it — take a screenshot to verify before the next step.`;
  }

  if (IS_MAC) {
    await cliclick([`dc:${cx},${cy}`]);
  } else if (IS_WIN) {
    const script = `
Add-Type @"
using System; using System.Runtime.InteropServices;
public class Mouse {
  [DllImport("user32.dll")] public static extern void SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, int x, int y, uint d, int e);
}
"@
[Mouse]::SetCursorPos(${cx}, ${cy})
Start-Sleep -Milliseconds 50
[Mouse]::mouse_event(0x0002, 0, 0, 0, 0); [Mouse]::mouse_event(0x0004, 0, 0, 0, 0)
Start-Sleep -Milliseconds 50
[Mouse]::mouse_event(0x0002, 0, 0, 0, 0); [Mouse]::mouse_event(0x0004, 0, 0, 0, 0)
`;
    await execFileP("powershell", ["-NoProfile", "-Command", script], {
      timeout: 5000,
    });
  } else {
    await execFileP(
      "xdotool",
      ["mousemove", String(cx), String(cy), "click", "--repeat", "2", "1"],
      { timeout: 5000 },
    );
  }
  return `double-clicked ${at}`;
}

export async function typeText(
  text: string,
  mode: ComputerUseMode,
  onGuidance?: (e: GuidanceEvent) => void,
  note?: string,
): Promise<string> {
  if (mode === "guided") {
    onGuidance?.({ kind: "type", text, caption: note });
    return `Asked the user to type: "${text}". The user performs it — take a screenshot to verify before the next step.`;
  }

  if (IS_MAC) {
    await cliclick([`t:${text}`]);
  } else if (IS_WIN) {
    // SendKeys doesn't handle special chars well; use clip + paste for longer text
    const escaped = text.replace(/'/g, "''");
    const script = `
Add-Type -A System.Windows.Forms
[System.Windows.Forms.SendKeys]::SendWait('${escaped}')
`;
    await execFileP("powershell", ["-NoProfile", "-Command", script], {
      timeout: 10_000,
    });
  } else {
    try {
      await execFileP("xdotool", ["type", "--clearmodifiers", text], {
        timeout: 10_000,
      });
    } catch {
      await execFileP("wtype", [text], { timeout: 10_000 });
    }
  }
  return `typed ${text.length} characters`;
}

export async function pressKey(
  chord: string,
  mode: ComputerUseMode,
  onGuidance?: (e: GuidanceEvent) => void,
  note?: string,
): Promise<string> {
  if (mode === "guided") {
    onGuidance?.({ kind: "key", text: chord, caption: note });
    return `Asked the user to press ${chord}. The user performs it — take a screenshot to verify before the next step.`;
  }

  if (IS_MAC) {
    await run(OSASCRIPT, ["-e", buildKeystrokeScript(chord)]);
  } else if (IS_WIN) {
    // Map common chord syntax to SendKeys format
    const winChord = chord
      .replace(/cmd\+/gi, "^")
      .replace(/ctrl\+/gi, "^")
      .replace(/alt\+/gi, "%")
      .replace(/shift\+/gi, "+");
    const script = `
Add-Type -A System.Windows.Forms
[System.Windows.Forms.SendKeys]::SendWait('${winChord}')
`;
    await execFileP("powershell", ["-NoProfile", "-Command", script], {
      timeout: 5000,
    });
  } else {
    // xdotool uses '+' separator, which matches our chord format
    try {
      await execFileP("xdotool", ["key", chord], { timeout: 5000 });
    } catch {
      // Try wtype for Wayland
      const parts = chord.split("+");
      const key = parts[parts.length - 1];
      const mods = parts.slice(0, -1);
      const args: string[] = [];
      for (const m of mods) {
        if (m.toLowerCase() === "ctrl" || m.toLowerCase() === "control")
          args.push("-M", "ctrl");
        else if (m.toLowerCase() === "alt" || m.toLowerCase() === "option")
          args.push("-M", "alt");
        else if (m.toLowerCase() === "shift") args.push("-M", "shift");
        else if (m.toLowerCase() === "cmd" || m.toLowerCase() === "super")
          args.push("-M", "logo");
      }
      args.push("-k", key);
      await execFileP("wtype", args, { timeout: 5000 });
    }
  }
  return `pressed ${chord}`;
}

/** Clear the guidance overlay. */
export function clearGuidance(onGuidance?: (e: GuidanceEvent) => void): void {
  onGuidance?.({ kind: "clear" });
}
