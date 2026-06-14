import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createAppLogger } from "@freestyle/utils";

const log = createAppLogger("paste");

// Keep in sync with terminal_classes[] in native/linux-fast-paste.c
const TERMINAL_IDENTIFIERS = [
  "konsole",
  "gnome-terminal",
  "terminal",
  "kitty",
  "alacritty",
  "terminator",
  "xterm",
  "urxvt",
  "rxvt",
  "tilix",
  "terminology",
  "wezterm",
  "foot",
  "st-256color",
  "st-",
  "yakuake",
  "ghostty",
  "guake",
  "tilda",
  "hyper",
  "tabby",
  "sakura",
  "warp",
  "termius",
  "integrated-terminal",
];

const IDE_HOST_IDENTIFIERS = [
  "code",
  "cursor",
  "zed",
  "vscodium",
  "codium",
  "windsurf",
  "fleet",
];

function matchesTerminal(identifier: string): boolean {
  const lower = identifier.toLowerCase();
  return TERMINAL_IDENTIFIERS.some((term) => lower.includes(term));
}

/** Heuristic for VS Code / Zed integrated terminals on Wayland compositors. */
function matchesIntegratedTerminal(className: string, title?: string): boolean {
  const cls = className.toLowerCase();
  if (!IDE_HOST_IDENTIFIERS.some((ide) => cls.includes(ide))) return false;
  if (!title) return false;

  const normalized = title.toLowerCase();
  if (/\bterminal\b/.test(normalized)) return true;

  // Shell names commonly appear in integrated terminal tab titles.
  return /\b(bash|zsh|fish|pwsh|nushell|dash|ash|sh)\b/.test(normalized);
}

function execFileCapture(
  path: string,
  args: string[] = [],
  timeoutMs = 1500,
): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(path, args, { timeout: timeoutMs }, (err, stdout) => {
      if (err) {
        resolve(null);
        return;
      }
      const text = stdout.trim();
      resolve(text || null);
    });
  });
}

async function detectViaXdotool(): Promise<string | null> {
  const windowId = await execFileCapture("xdotool", ["getactivewindow"]);
  if (!windowId) return null;

  let currentId = windowId;
  for (let depth = 0; depth < 20; depth++) {
    const className = await execFileCapture("xdotool", [
      "getwindowclassname",
      currentId,
    ]);
    if (className && matchesTerminal(className)) return className;

    const windowName = await execFileCapture("xdotool", [
      "getwindowname",
      currentId,
    ]);
    if (windowName && matchesTerminal(windowName)) return windowName;
    if (
      className &&
      matchesIntegratedTerminal(className, windowName ?? undefined)
    ) {
      return "integrated-terminal";
    }

    const parentId = await execFileCapture("xdotool", [
      "getwindowparent",
      currentId,
    ]);
    if (!parentId || parentId === "0" || parentId === currentId) break;
    currentId = parentId;
  }

  const pid = await execFileCapture("xdotool", ["getwindowpid", windowId]);
  if (pid) {
    try {
      const comm = (await readFile(`/proc/${pid}/comm`, "utf8")).trim();
      if (matchesTerminal(comm)) return comm;
    } catch {
      // Process may have exited.
    }
  }

  return null;
}

async function detectViaHyprland(): Promise<string | null> {
  const output = await execFileCapture("hyprctl", ["activewindow", "-j"]);
  if (!output) return null;

  try {
    const data = JSON.parse(output) as {
      class?: string;
      initialClass?: string;
      title?: string;
    };
    const className = data.class ?? data.initialClass ?? "";
    if (matchesTerminal(className)) return className;
    if (matchesIntegratedTerminal(className, data.title)) {
      return "integrated-terminal";
    }
    return className || null;
  } catch {
    return null;
  }
}

type SwayNode = {
  focused?: boolean;
  type?: string;
  app_id?: string;
  name?: string;
  window_properties?: { class?: string };
  nodes?: SwayNode[];
  floating_nodes?: SwayNode[];
};

function findFocusedSwayNode(node: SwayNode): string | null {
  if (node.focused && node.type === "con") {
    const className =
      node.app_id ?? node.window_properties?.class ?? node.name ?? "";
    const title = node.name ?? "";
    if (matchesTerminal(className)) return className;
    if (matchesIntegratedTerminal(className, title)) {
      return "integrated-terminal";
    }
    return className || null;
  }

  for (const child of node.nodes ?? []) {
    const found = findFocusedSwayNode(child);
    if (found) return found;
  }

  for (const child of node.floating_nodes ?? []) {
    const found = findFocusedSwayNode(child);
    if (found) return found;
  }

  return null;
}

async function detectViaSway(): Promise<string | null> {
  const output = await execFileCapture("swaymsg", ["-t", "get_tree"]);
  if (!output) return null;

  try {
    const tree = JSON.parse(output) as SwayNode | SwayNode[];
    const roots = Array.isArray(tree) ? tree : [tree];
    for (const root of roots) {
      const found = findFocusedSwayNode(root);
      if (found) return found;
    }
  } catch {
    return null;
  }

  return null;
}

async function detectViaGnomeShell(): Promise<string | null> {
  const output = await execFileCapture("gdbus", [
    "call",
    "--session",
    "--dest",
    "org.gnome.Shell",
    "--object-path",
    "/org/gnome/Shell",
    "--method",
    "org.gnome.Shell.Eval",
    "global.display.focus_window ? global.display.focus_window.get_wm_class() : ''",
  ]);
  if (!output) return null;

  const match = output.match(/\('([^']*)'/);
  return match?.[1] || null;
}

function orderedDetectors(): Array<() => Promise<string | null>> {
  const desktop = (process.env.XDG_CURRENT_DESKTOP ?? "").toLowerCase();
  const ordered: Array<() => Promise<string | null>> = [];
  const seen = new Set<() => Promise<string | null>>();

  const add = (detect: () => Promise<string | null>) => {
    if (seen.has(detect)) return;
    seen.add(detect);
    ordered.push(detect);
  };

  if (process.env.HYPRLAND_INSTANCE_SIGNATURE) add(detectViaHyprland);
  if (process.env.SWAYSOCK) add(detectViaSway);
  if (desktop.includes("gnome")) add(detectViaGnomeShell);

  add(detectViaXdotool);
  add(detectViaHyprland);
  add(detectViaSway);
  add(detectViaGnomeShell);

  return ordered;
}

/**
 * Best-effort detection of whether the currently focused app is a terminal.
 * Uses compositor-specific APIs on Wayland and xdotool on X11 / XWayland.
 */
export async function isLinuxTerminalFocused(): Promise<boolean> {
  const detectors = orderedDetectors();

  for (const detect of detectors) {
    try {
      const identifier = await detect();
      if (identifier && matchesTerminal(identifier)) {
        log.debug(`terminal focus detected via ${detect.name}: ${identifier}`);
        return true;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.debug(`${detect.name} failed: ${message}`);
    }
  }

  return false;
}
