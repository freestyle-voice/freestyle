/**
 * Computer use (Voice OS — Part D, experimental, opt-in).
 *
 * Exposes a macOS desktop actuator to the Claude agent as in-process MCP tools
 * (screenshot + mouse + keyboard). The Agent SDK has no native `computer` tool,
 * so we surface our own `mcp__computer__*` tools and execute them against the
 * real desktop. The agent decides actions by looking at the screenshots we
 * return.
 *
 * Requirements (macOS only):
 *  - `cliclick` for mouse/keyboard:  `brew install cliclick`
 *  - built-in `screencapture` + `sips` (always present)
 *  - macOS permissions granted to the Freestyle app: **Screen Recording**
 *    (for screencapture) and **Accessibility** (for cliclick).
 *
 * Coordinates are LOGICAL screen points. We downscale the Retina capture to the
 * display's logical size before returning it, so the model's clicks line up 1:1
 * with what it sees, and `cliclick` (which also uses logical points) matches.
 *
 * ⚠️ Safety: this lets the agent control the real machine. It is gated behind
 * the `agentComputerUse` setting (default off) and is independent of the
 * engine's existing bypass-permissions posture — enabling it widens the blast
 * radius considerably. Treat as experimental.
 */
import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createSdkMcpServer,
  type McpSdkServerConfigWithInstance,
  tool,
} from "@anthropic-ai/claude-agent-sdk";
import { createAppLogger } from "@freestyle/utils";
import { app, screen } from "electron";
import { z } from "zod";
import { getNativeBinaryPath } from "../native-binary.js";

const log = createAppLogger("agent-computer");

const SCREENCAPTURE = "/usr/sbin/screencapture";
const SIPS = "/usr/bin/sips";

function run(cmd: string, args: string[], timeoutMs = 15000): Promise<string> {
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

// ---- cliclick discovery ----
// Seamless path: a `cliclick` binary we bundle in the app's resources (no
// Homebrew required). Falls back to a Homebrew/PATH install for dev builds.
let cliclickPath: string | null | undefined;

async function findCliclick(): Promise<string | null> {
  if (cliclickPath !== undefined) return cliclickPath;
  // Bundled binary first (resources/bin/<platform>-<arch>/cliclick → Resources/bin),
  // then a Homebrew/PATH install for dev builds that don't ship it.
  const bundled = getNativeBinaryPath("cliclick");
  const candidates = [
    ...(bundled ? [bundled] : []),
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

async function findBrew(): Promise<string | null> {
  for (const p of ["/opt/homebrew/bin/brew", "/usr/local/bin/brew", "brew"]) {
    try {
      await run(p, ["--version"], 4000);
      return p;
    } catch {
      // try next
    }
  }
  return null;
}

/**
 * Best-effort install of the desktop-control helper for builds that don't ship
 * a bundled `cliclick` (e.g. local dev). Shipped builds bundle it, so this is a
 * fallback. Tries Homebrew; returns a clear reason if it can't.
 */
export async function installCliclick(): Promise<{
  ok: boolean;
  reason?: string;
}> {
  if (process.platform !== "darwin") {
    return { ok: false, reason: "Computer use is macOS-only in this build." };
  }
  cliclickPath = undefined; // re-probe (bundled binary may have just appeared)
  if (await findCliclick()) return { ok: true };

  const brew = await findBrew();
  if (!brew) {
    return {
      ok: false,
      reason:
        "Homebrew not found. Install Homebrew from https://brew.sh and retry, or use a Freestyle build that bundles the helper.",
    };
  }
  try {
    log.info("installing cliclick via Homebrew…");
    await run(brew, ["install", "cliclick"], 180000);
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
  cliclickPath = undefined;
  return (await findCliclick())
    ? { ok: true }
    : {
        ok: false,
        reason: "Install completed but cliclick still wasn't found.",
      };
}

export async function computerUseAvailable(): Promise<{
  ok: boolean;
  reason?: string;
}> {
  if (process.platform !== "darwin") {
    return { ok: false, reason: "Computer use is macOS-only in this build." };
  }
  const cli = await findCliclick();
  if (!cli) {
    return {
      ok: false,
      reason:
        "`cliclick` not found. Install it with `brew install cliclick`, then grant Freestyle Accessibility + Screen Recording permission.",
    };
  }
  return { ok: true };
}

/** Whether the user has opted into computer use (settings.json `agentComputerUse`). */
export function computerUseEnabled(): boolean {
  try {
    const settings = JSON.parse(
      readFileSync(join(app.getPath("userData"), "settings.json"), "utf-8"),
    ) as { agentComputerUse?: unknown };
    return settings.agentComputerUse === true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Actuator
// ---------------------------------------------------------------------------

function logicalSize(): { width: number; height: number } {
  const { width, height } = screen.getPrimaryDisplay().size;
  return { width: Math.round(width), height: Math.round(height) };
}

async function cliclick(args: string[]): Promise<void> {
  const path = await findCliclick();
  if (!path) throw new Error("cliclick unavailable");
  await run(path, args);
}

async function captureScreenshot(): Promise<{
  data: string;
  width: number;
  height: number;
}> {
  const { width, height } = logicalSize();
  const dir = mkdtempSync(join(tmpdir(), "fs-shot-"));
  const file = join(dir, "shot.png");
  try {
    // -x: silent, -D 1: main display.
    await run(SCREENCAPTURE, ["-x", "-D", "1", "-t", "png", file]);
    // Downscale the Retina capture to logical size (sips -z HEIGHT WIDTH) so the
    // image's pixel space equals the logical coordinate space cliclick uses.
    await run(SIPS, ["-z", String(height), String(width), file]);
    const data = readFileSync(file).toString("base64");
    return { data, width, height };
  } finally {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {}
  }
}

function clampX(x: number): number {
  return Math.max(0, Math.min(logicalSize().width - 1, Math.round(x)));
}
function clampY(y: number): number {
  return Math.max(0, Math.min(logicalSize().height - 1, Math.round(y)));
}

// Chord parsing: "cmd+shift+4" → modifiers [cmd, shift] + key "4".
const MOD_MAP: Record<string, string> = {
  cmd: "cmd",
  command: "cmd",
  ctrl: "ctrl",
  control: "ctrl",
  alt: "alt",
  option: "alt",
  opt: "alt",
  shift: "shift",
  fn: "fn",
};
const KEY_MAP: Record<string, string> = {
  enter: "return",
  return: "return",
  esc: "esc",
  escape: "esc",
  tab: "tab",
  space: "space",
  delete: "delete",
  backspace: "delete",
  up: "arrow-up",
  down: "arrow-down",
  left: "arrow-left",
  right: "arrow-right",
  home: "home",
  end: "end",
  pageup: "page-up",
  pagedown: "page-down",
};

function buildKeyArgs(chord: string): string[] {
  const parts = chord
    .split("+")
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);
  if (parts.length === 0) throw new Error("empty key chord");
  const key = parts[parts.length - 1];
  const mods = parts.slice(0, -1).map((m) => {
    const mapped = MOD_MAP[m];
    if (!mapped) throw new Error(`unknown modifier: ${m}`);
    return mapped;
  });

  const keyArg = key.length === 1 ? `t:${key}` : `kp:${KEY_MAP[key] ?? key}`;
  return [
    ...mods.map((m) => `kd:${m}`),
    keyArg,
    ...mods.reverse().map((m) => `ku:${m}`),
  ];
}

// ---------------------------------------------------------------------------
// MCP tool results
// ---------------------------------------------------------------------------

type ToolResult = {
  content: Array<
    | { type: "text"; text: string }
    | { type: "image"; data: string; mimeType: string }
  >;
  isError?: boolean;
};

function ok(text: string): ToolResult {
  return { content: [{ type: "text", text }] };
}
function err(message: string): ToolResult {
  return {
    content: [{ type: "text", text: `Error: ${message}` }],
    isError: true,
  };
}

async function guarded(fn: () => Promise<ToolResult>): Promise<ToolResult> {
  const avail = await computerUseAvailable();
  if (!avail.ok) return err(avail.reason ?? "computer use unavailable");
  try {
    return await fn();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log.warn(`computer-use action failed: ${msg}`);
    return err(msg);
  }
}

// ---------------------------------------------------------------------------
// MCP server
// ---------------------------------------------------------------------------

export function createComputerUseServer(): McpSdkServerConfigWithInstance {
  return createSdkMcpServer({
    name: "computer",
    version: "0.1.0",
    instructions:
      "Control the user's macOS desktop. ALWAYS call `screenshot` first to see the screen before acting. Click/move coordinates are in the pixel space of the most recent screenshot (logical screen points, top-left origin). These actions affect the real machine — be deliberate and verify with a fresh screenshot after each step.",
    tools: [
      tool(
        "screenshot",
        "Capture the current screen. Returns a PNG; all click/move coordinates use this image's pixel space.",
        {},
        async () =>
          guarded(async () => {
            const shot = await captureScreenshot();
            return {
              content: [
                { type: "image", data: shot.data, mimeType: "image/png" },
                {
                  type: "text",
                  text: `Screen captured at ${shot.width}x${shot.height} logical pixels. Coordinates are in this space.`,
                },
              ],
            };
          }),
      ),
      tool(
        "left_click",
        "Move the cursor to (x, y) and left-click.",
        { x: z.number(), y: z.number() },
        async ({ x, y }) =>
          guarded(async () => {
            await cliclick([`c:${clampX(x)},${clampY(y)}`]);
            return ok(`left-clicked (${Math.round(x)}, ${Math.round(y)})`);
          }),
      ),
      tool(
        "right_click",
        "Move the cursor to (x, y) and right-click.",
        { x: z.number(), y: z.number() },
        async ({ x, y }) =>
          guarded(async () => {
            await cliclick([`rc:${clampX(x)},${clampY(y)}`]);
            return ok(`right-clicked (${Math.round(x)}, ${Math.round(y)})`);
          }),
      ),
      tool(
        "double_click",
        "Move the cursor to (x, y) and double-click.",
        { x: z.number(), y: z.number() },
        async ({ x, y }) =>
          guarded(async () => {
            await cliclick([`dc:${clampX(x)},${clampY(y)}`]);
            return ok(`double-clicked (${Math.round(x)}, ${Math.round(y)})`);
          }),
      ),
      tool(
        "move_cursor",
        "Move the cursor to (x, y) without clicking.",
        { x: z.number(), y: z.number() },
        async ({ x, y }) =>
          guarded(async () => {
            await cliclick([`m:${clampX(x)},${clampY(y)}`]);
            return ok(`moved to (${Math.round(x)}, ${Math.round(y)})`);
          }),
      ),
      tool(
        "type_text",
        "Type a string of text at the current keyboard focus.",
        { text: z.string() },
        async ({ text }) =>
          guarded(async () => {
            await cliclick([`t:${text}`]);
            return ok(`typed ${text.length} characters`);
          }),
      ),
      tool(
        "press_key",
        "Press a single key or chord, e.g. 'return', 'escape', 'cmd+space', 'cmd+shift+4', 'pagedown'.",
        { keys: z.string() },
        async ({ keys }) =>
          guarded(async () => {
            await cliclick(buildKeyArgs(keys));
            return ok(`pressed ${keys}`);
          }),
      ),
    ],
  });
}
