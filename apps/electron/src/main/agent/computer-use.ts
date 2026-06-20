/**
 * Computer use (Voice OS — Part D, experimental, opt-in).
 *
 * Exposes a desktop actuator to the Claude agent as in-process MCP tools
 * (screenshot + mouse + keyboard). The Agent SDK has no native `computer` tool,
 * so we surface our own `mcp__computer__*` tools and execute them against the
 * real desktop. The agent decides actions from the screenshots we return.
 *
 * This file is the platform-agnostic facade: prerequisites, the MCP server, and
 * the opt-in gate. All OS-specific actuation lives behind `DesktopActuator`
 * (see ./desktop) — macOS today, Windows/Linux next. The MCP tool list is
 * generated from the active backend's declared capabilities, so the model never
 * sees a tool the platform can't honor.
 *
 * Coordinates are LOGICAL screen pixels in the most recent screenshot's space
 * (top-left origin); the backend maps that to device pixels and clamps.
 *
 * ⚠️ Safety: this lets the agent control the real machine. It is gated behind
 * the `agentComputerUse` setting (default off) and is independent of the
 * engine's bypass-permissions posture — enabling it widens the blast radius
 * considerably. Treat as experimental.
 */
import {
  createSdkMcpServer,
  type McpSdkServerConfigWithInstance,
  tool,
} from "@anthropic-ai/claude-agent-sdk";
import { createAppLogger } from "@freestyle/utils";
import type {
  ComputerUseMode,
  ComputerUsePrereqs,
} from "@freestyle/validations";
import { z } from "zod";
import type { SelfTestResult } from "./desktop/index.js";
import { getActuator } from "./desktop/index.js";
import { type AgentSettings, readAgentSettings } from "./settings.js";

const log = createAppLogger("agent-computer");

/** Actuation mode (settings.json `agentComputerUseMode`). Defaults to the
 *  non-invasive `guided` mode. */
export function computerUseMode(
  settings: AgentSettings = readAgentSettings(),
): ComputerUseMode {
  return settings.agentComputerUseMode === "full" ? "full" : "guided";
}

// ---------------------------------------------------------------------------
// Prerequisites / lifecycle (delegated to the active backend for the mode)
// ---------------------------------------------------------------------------

/** Full, honest prerequisite snapshot, probed live every call (cheap). */
export async function computerUsePrereqs(
  settings: AgentSettings = readAgentSettings(),
): Promise<ComputerUsePrereqs> {
  return getActuator(computerUseMode(settings)).prereqs();
}

/** Best-effort trigger for any first-run OS capture permission prompt. */
export async function requestScreenRecording(): Promise<ComputerUsePrereqs> {
  return getActuator(computerUseMode()).requestPermissions();
}

/** Locate or install the desktop-control helper the backend needs. */
export async function installCliclick(): Promise<{
  ok: boolean;
  reason?: string;
}> {
  return getActuator(computerUseMode()).ensureHelper();
}

/** One-shot functional check (capture round-trip); logged at session start. */
export async function computerUseSelfTest(
  settings: AgentSettings = readAgentSettings(),
): Promise<SelfTestResult> {
  return getActuator(computerUseMode(settings)).selfTest();
}

/** Whether the user has opted into computer use (settings.json `agentComputerUse`). */
export function computerUseEnabled(
  settings: AgentSettings = readAgentSettings(),
): boolean {
  return settings.agentComputerUse === true;
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

// ---------------------------------------------------------------------------
// MCP server — tools generated from the backend's capabilities
// ---------------------------------------------------------------------------

// A short caption the agent attaches to each action. In guided mode it's shown
// to the user as the ghost-cursor caption; in full mode it's ignored.
const noteSchema = {
  note: z
    .string()
    .optional()
    .describe(
      "Short caption describing this step for the user, e.g. 'Click the Export button'. Shown in guided mode.",
    ),
};

export function createComputerUseServer(
  settings: AgentSettings = readAgentSettings(),
): McpSdkServerConfigWithInstance {
  const actuator = getActuator(computerUseMode(settings));
  const caps = actuator.capabilities();
  const guided = actuator.actuation === "guided";

  /** Re-check prerequisites before every action so a permission revoked mid-run
   *  surfaces as a clear error instead of a silent no-op. */
  const guarded = async (
    fn: () => Promise<ToolResult>,
  ): Promise<ToolResult> => {
    const prereqs = await actuator.prereqs();
    if (!prereqs.ok) return err(prereqs.reason ?? "computer use unavailable");
    try {
      return await fn();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log.warn(`computer-use action failed: ${msg}`);
      return err(msg);
    }
  };

  // In guided mode the agent points; the user acts. Phrase results so the model
  // waits for the user and verifies via a screenshot instead of assuming the
  // action already happened.
  const done = (direct: string, guidedHint: string): ToolResult =>
    ok(
      guided
        ? `${guidedHint} The user performs it — take a screenshot to verify before the next step.`
        : direct,
    );

  const screenshotTool = tool(
    "screenshot",
    "Capture the current screen. Returns a PNG; all click/move coordinates use this image's pixel space.",
    {},
    async () =>
      guarded(async () => {
        const shot = await actuator.screenshot();
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
  );

  const leftClickTool = tool(
    "left_click",
    "Move the cursor to (x, y) and left-click.",
    { x: z.number(), y: z.number(), ...noteSchema },
    async ({ x, y, note }) =>
      guarded(async () => {
        await actuator.click(x, y, "left", note);
        const at = `(${Math.round(x)}, ${Math.round(y)})`;
        return done(`left-clicked ${at}`, `Pointed the user to click ${at}.`);
      }),
  );

  const rightClickTool = tool(
    "right_click",
    "Move the cursor to (x, y) and right-click.",
    { x: z.number(), y: z.number(), ...noteSchema },
    async ({ x, y, note }) =>
      guarded(async () => {
        await actuator.click(x, y, "right", note);
        const at = `(${Math.round(x)}, ${Math.round(y)})`;
        return done(
          `right-clicked ${at}`,
          `Pointed the user to right-click ${at}.`,
        );
      }),
  );

  const doubleClickTool = tool(
    "double_click",
    "Move the cursor to (x, y) and double-click.",
    { x: z.number(), y: z.number(), ...noteSchema },
    async ({ x, y, note }) =>
      guarded(async () => {
        await actuator.doubleClick(x, y, note);
        const at = `(${Math.round(x)}, ${Math.round(y)})`;
        return done(
          `double-clicked ${at}`,
          `Pointed the user to double-click ${at}.`,
        );
      }),
  );

  const moveCursorTool = tool(
    "move_cursor",
    "Move the cursor to (x, y) without clicking.",
    { x: z.number(), y: z.number(), ...noteSchema },
    async ({ x, y, note }) =>
      guarded(async () => {
        await actuator.moveCursor(x, y, note);
        const at = `(${Math.round(x)}, ${Math.round(y)})`;
        return done(`moved to ${at}`, `Pointed the user to ${at}.`);
      }),
  );

  const typeTextTool = tool(
    "type_text",
    "Type a string of text at the current keyboard focus.",
    { text: z.string(), ...noteSchema },
    async ({ text, note }) =>
      guarded(async () => {
        await actuator.typeText(text, note);
        return done(
          `typed ${text.length} characters`,
          `Asked the user to type: "${text}".`,
        );
      }),
  );

  const pressKeyTool = tool(
    "press_key",
    "Press a single key or chord, e.g. 'return', 'escape', 'cmd+space', 'cmd+shift+4', 'pagedown'.",
    { keys: z.string(), ...noteSchema },
    async ({ keys, note }) =>
      guarded(async () => {
        await actuator.pressKey(keys, note);
        return done(`pressed ${keys}`, `Asked the user to press ${keys}.`);
      }),
  );

  // Only register tools the backend can actually perform.
  const tools = [
    ...(caps.screenshot ? [screenshotTool] : []),
    ...(caps.click ? [leftClickTool, rightClickTool] : []),
    ...(caps.doubleClick ? [doubleClickTool] : []),
    ...(caps.mouseMove ? [moveCursorTool] : []),
    ...(caps.typeText ? [typeTextTool] : []),
    ...(caps.pressKey ? [pressKeyTool] : []),
  ];

  const baseInstructions =
    "ALWAYS call `screenshot` first to see the screen before acting. Click/move coordinates are in the pixel space of the most recent screenshot (logical screen points, top-left origin).";
  const instructions = guided
    ? `You are in GUIDED (teaching) mode. You do NOT control the mouse or keyboard — each tool call instead shows the user a ghost-cursor hint and a caption, and the USER performs the step. ${baseInstructions} For every action, pass a short \`note\` describing what to do and why (it's shown to the user). Work ONE small step at a time, and after each step take a fresh screenshot to confirm the user completed it before continuing — never assume an action happened.`
    : `Control the user's desktop directly. ${baseInstructions} These actions affect the real machine — be deliberate and verify with a fresh screenshot after each step.`;

  return createSdkMcpServer({
    name: "computer",
    version: "0.1.0",
    instructions,
    tools,
  });
}
