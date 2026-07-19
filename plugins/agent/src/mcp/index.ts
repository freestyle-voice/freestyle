import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type JSONSchema7, jsonSchema, type Tool, tool } from "ai";
import { z } from "zod";
import { TOOL_GROUPS, type UiResource } from "../config.js";
import { getFrontmostApp, pasteText } from "./tools/context.js";
import {
  type ComputerUseMode,
  clickMouse,
  doubleClick,
  type GuidanceEvent,
  moveCursor,
  pressKey,
  typeText,
} from "./tools/desktop.js";
import {
  listDirectory,
  readFile,
  searchFiles,
  writeFile,
} from "./tools/filesystem.js";
import { takeScreenshot } from "./tools/screenshot.js";
import { runCommand } from "./tools/shell.js";
import { IS_MACOS, runShortcut } from "./tools/shortcuts.js";
import { getClipboard, openUrl, setClipboard } from "./tools/system.js";

/** Emitted when a tool starts executing (no output yet). */
export interface ToolCallStartEvent {
  callId: string;
  tool: string;
  input: Record<string, unknown>;
}

/** Emitted when a tool finishes executing. */
export interface ToolCallEvent {
  callId: string;
  tool: string;
  input: Record<string, unknown>;
  output: string;
  isError?: boolean;
  uiResource?: UiResource;
}

/**
 * Returns AI SDK `tool()` objects for all built-in tools. These are merged
 * directly into the `streamText` tool map so the agent can call them without
 * MCP protocol overhead.
 *
 * @param disabledGroups - Optional map of group IDs to booleans. Tools
 *   belonging to a group where the value is `false` are excluded.
 * @param opts.computerUseMode - If set, registers computer-use tools
 *   (mouse/keyboard). `"guided"` mode shows a ghost-cursor overlay instead of
 *   real input.
 * @param opts.onGuidance - Callback for guidance events in guided mode.
 * @param opts.onToolCall - Callback for all tool call events (for rich UI cards).
 */
export function getBuiltinTools(
  disabledGroups?: Record<string, boolean>,
  opts?: {
    computerUseMode?: ComputerUseMode;
    onGuidance?: (e: GuidanceEvent) => void;
    onToolCall?: (e: ToolCallEvent) => void;
  },
): Record<string, Tool> {
  const tools: Record<string, Tool> = {};

  // Build a set of tool names that should be skipped.
  const skip = new Set<string>();
  if (disabledGroups) {
    for (const group of TOOL_GROUPS) {
      if (disabledGroups[group.id] === false) {
        for (const t of group.tools) skip.add(t);
      }
    }
  }

  const include = (name: string): boolean => !skip.has(name);

  // --- Tier 1: Core ---

  if (include("read_file"))
    tools.read_file = tool({
      description:
        "Read the contents of a file. Returns numbered lines. Use offset/limit for large files.",
      inputSchema: jsonSchema({
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Absolute or relative file path",
          },
          offset: {
            type: "number",
            description: "Line number to start from (1-indexed, default 1)",
          },
          limit: {
            type: "number",
            description: "Max lines to return (default: all)",
          },
        },
        required: ["path"],
      } satisfies JSONSchema7),
      execute: async (args) =>
        readFile(args as { path: string; offset?: number; limit?: number }),
    });

  if (include("write_file"))
    tools.write_file = tool({
      description:
        "Write content to a file. Creates parent directories if needed. Overwrites existing files.",
      inputSchema: jsonSchema({
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Absolute or relative file path",
          },
          content: { type: "string", description: "Content to write" },
        },
        required: ["path", "content"],
      } satisfies JSONSchema7),
      execute: async (args) =>
        writeFile(args as { path: string; content: string }),
    });

  if (include("list_directory"))
    tools.list_directory = tool({
      description:
        "List files and directories at a path. Returns name, type (file/directory/symlink), and size.",
      inputSchema: jsonSchema({
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Directory path to list",
          },
        },
        required: ["path"],
      } satisfies JSONSchema7),
      execute: async (args) => listDirectory(args as { path: string }),
    });

  if (include("search_files"))
    tools.search_files = tool({
      description:
        "Search for a regex pattern across files in a directory. Returns matching file:line results.",
      inputSchema: jsonSchema({
        type: "object",
        properties: {
          pattern: {
            type: "string",
            description: "Regex pattern to search for",
          },
          path: {
            type: "string",
            description: "Directory to search in (default: cwd)",
          },
          include: {
            type: "string",
            description: "Glob pattern to filter files (e.g. '*.ts')",
          },
        },
        required: ["pattern"],
      } satisfies JSONSchema7),
      execute: async (args) =>
        searchFiles(
          args as { pattern: string; path?: string; include?: string },
        ),
    });

  if (include("run_command"))
    tools.run_command = tool({
      description:
        "Execute a shell command and return stdout, stderr, and exit code. Use for build, test, git, npm, etc.",
      inputSchema: jsonSchema({
        type: "object",
        properties: {
          command: { type: "string", description: "Shell command to execute" },
          cwd: {
            type: "string",
            description: "Working directory (default: cwd)",
          },
          timeout: {
            type: "number",
            description: "Timeout in seconds (default 30, max 120)",
          },
        },
        required: ["command"],
      } satisfies JSONSchema7),
      execute: async (args) =>
        runCommand(args as { command: string; cwd?: string; timeout?: number }),
    });

  if (include("open_url"))
    tools.open_url = tool({
      description:
        "Open a URL in the default browser or an app scheme (e.g. slack://). Works on macOS, Linux, and Windows.",
      inputSchema: jsonSchema({
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "URL or app scheme to open",
          },
        },
        required: ["url"],
      } satisfies JSONSchema7),
      execute: async (args) => openUrl(args as { url: string }),
    });

  if (include("get_clipboard"))
    tools.get_clipboard = tool({
      description: "Read the current text contents of the system clipboard.",
      inputSchema: jsonSchema({
        type: "object",
        properties: {},
      } satisfies JSONSchema7),
      execute: async () => getClipboard(),
    });

  if (include("set_clipboard"))
    tools.set_clipboard = tool({
      description: "Write text to the system clipboard.",
      inputSchema: jsonSchema({
        type: "object",
        properties: {
          text: { type: "string", description: "Text to copy to clipboard" },
        },
        required: ["text"],
      } satisfies JSONSchema7),
      execute: async (args) => setClipboard(args as { text: string }),
    });

  // --- Tier 2: Context Awareness ---

  if (include("get_frontmost_app"))
    tools.get_frontmost_app = tool({
      description:
        "Get the currently focused application name, window title, and browser tab URL (if applicable).",
      inputSchema: jsonSchema({
        type: "object",
        properties: {},
      } satisfies JSONSchema7),
      execute: async () => getFrontmostApp(),
    });

  if (include("paste_text"))
    tools.paste_text = tool({
      description:
        "Paste text into the currently focused application by writing to the clipboard and simulating Cmd+V / Ctrl+V.",
      inputSchema: jsonSchema({
        type: "object",
        properties: {
          text: {
            type: "string",
            description: "Text to paste into the focused app",
          },
        },
        required: ["text"],
      } satisfies JSONSchema7),
      execute: async (args) => pasteText(args as { text: string }),
    });

  if (IS_MACOS && include("run_shortcut")) {
    tools.run_shortcut = tool({
      description:
        "Run a macOS Shortcut by name. Optionally pipe input text to it.",
      inputSchema: jsonSchema({
        type: "object",
        properties: {
          name: { type: "string", description: "Name of the macOS Shortcut" },
          input: {
            type: "string",
            description: "Optional text input piped to the shortcut",
          },
        },
        required: ["name"],
      } satisfies JSONSchema7),
      execute: async (args) =>
        runShortcut(args as { name: string; input?: string }),
    });
  }

  // --- Tier 3: Power Tools ---

  if (include("take_screenshot"))
    tools.take_screenshot = tool({
      description:
        "Capture a full-resolution screenshot of the current display. Returns a file path. ALWAYS call this first before any mouse/keyboard action to see the screen.",
      inputSchema: jsonSchema({
        type: "object",
        properties: {},
      } satisfies JSONSchema7),
      execute: async () => takeScreenshot(),
    });

  // --- Tier 4: Computer Use (mouse & keyboard) ---

  const cuMode = opts?.computerUseMode;
  const onGuidance = opts?.onGuidance;

  if (cuMode && include("left_click"))
    tools.left_click = tool({
      description: "Move the cursor to (x, y) and left-click.",
      inputSchema: jsonSchema({
        type: "object",
        properties: {
          x: { type: "number", description: "X coordinate (logical pixels)" },
          y: { type: "number", description: "Y coordinate (logical pixels)" },
          note: {
            type: "string",
            description:
              "Short caption describing this step for the user, e.g. 'Click the Export button'.",
          },
        },
        required: ["x", "y"],
      } satisfies JSONSchema7),
      execute: async (args) => {
        const { x, y, note } = args as {
          x: number;
          y: number;
          note?: string;
        };
        return clickMouse(x, y, "left", cuMode, onGuidance, note);
      },
    });

  if (cuMode && include("right_click"))
    tools.right_click = tool({
      description: "Move the cursor to (x, y) and right-click.",
      inputSchema: jsonSchema({
        type: "object",
        properties: {
          x: { type: "number", description: "X coordinate (logical pixels)" },
          y: { type: "number", description: "Y coordinate (logical pixels)" },
          note: {
            type: "string",
            description: "Short caption describing this step.",
          },
        },
        required: ["x", "y"],
      } satisfies JSONSchema7),
      execute: async (args) => {
        const { x, y, note } = args as {
          x: number;
          y: number;
          note?: string;
        };
        return clickMouse(x, y, "right", cuMode, onGuidance, note);
      },
    });

  if (cuMode && include("double_click"))
    tools.double_click = tool({
      description: "Move the cursor to (x, y) and double-click.",
      inputSchema: jsonSchema({
        type: "object",
        properties: {
          x: { type: "number", description: "X coordinate (logical pixels)" },
          y: { type: "number", description: "Y coordinate (logical pixels)" },
          note: {
            type: "string",
            description: "Short caption describing this step.",
          },
        },
        required: ["x", "y"],
      } satisfies JSONSchema7),
      execute: async (args) => {
        const { x, y, note } = args as {
          x: number;
          y: number;
          note?: string;
        };
        return doubleClick(x, y, cuMode, onGuidance, note);
      },
    });

  if (cuMode && include("move_cursor"))
    tools.move_cursor = tool({
      description: "Move the cursor to (x, y) without clicking.",
      inputSchema: jsonSchema({
        type: "object",
        properties: {
          x: { type: "number", description: "X coordinate (logical pixels)" },
          y: { type: "number", description: "Y coordinate (logical pixels)" },
          note: {
            type: "string",
            description: "Short caption describing this step.",
          },
        },
        required: ["x", "y"],
      } satisfies JSONSchema7),
      execute: async (args) => {
        const { x, y, note } = args as {
          x: number;
          y: number;
          note?: string;
        };
        return moveCursor(x, y, cuMode, onGuidance, note);
      },
    });

  if (cuMode && include("type_text"))
    tools.type_text = tool({
      description: "Type a string of text at the current keyboard focus.",
      inputSchema: jsonSchema({
        type: "object",
        properties: {
          text: { type: "string", description: "Text to type" },
          note: {
            type: "string",
            description: "Short caption describing this step.",
          },
        },
        required: ["text"],
      } satisfies JSONSchema7),
      execute: async (args) => {
        const { text: t, note } = args as { text: string; note?: string };
        return typeText(t, cuMode, onGuidance, note);
      },
    });

  if (cuMode && include("press_key"))
    tools.press_key = tool({
      description:
        "Press a single key or chord, e.g. 'return', 'escape', 'cmd+space', 'cmd+shift+4', 'pagedown'.",
      inputSchema: jsonSchema({
        type: "object",
        properties: {
          keys: { type: "string", description: "Key or chord to press" },
          note: {
            type: "string",
            description: "Short caption describing this step.",
          },
        },
        required: ["keys"],
      } satisfies JSONSchema7),
      execute: async (args) => {
        const { keys, note } = args as { keys: string; note?: string };
        return pressKey(keys, cuMode, onGuidance, note);
      },
    });

  return tools;
}

/** Clean up guidance overlay after a turn ends. */
export { clearGuidance } from "./tools/desktop.js";

/**
 * Register all built-in tools on an McpServer instance (for the external
 * Streamable HTTP endpoint).
 */
export function registerBuiltinTools(server: McpServer): void {
  // --- Tier 1: Core ---

  server.tool(
    "read_file",
    "Read the contents of a file. Returns numbered lines.",
    {
      path: z.string(),
      offset: z.number().optional(),
      limit: z.number().optional(),
    },
    async (args) => ({
      content: [{ type: "text" as const, text: readFile(args) }],
    }),
  );

  server.tool(
    "write_file",
    "Write content to a file. Creates parent directories if needed.",
    { path: z.string(), content: z.string() },
    async (args) => ({
      content: [{ type: "text" as const, text: writeFile(args) }],
    }),
  );

  server.tool(
    "list_directory",
    "List files and directories at a path with type and size.",
    { path: z.string() },
    async (args) => ({
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(listDirectory(args), null, 2),
        },
      ],
    }),
  );

  server.tool(
    "search_files",
    "Search for a regex pattern across files. Returns matching lines.",
    {
      pattern: z.string(),
      path: z.string().optional(),
      include: z.string().optional(),
    },
    async (args) => ({
      content: [{ type: "text" as const, text: await searchFiles(args) }],
    }),
  );

  server.tool(
    "run_command",
    "Execute a shell command. Returns stdout, stderr, exit code.",
    {
      command: z.string(),
      cwd: z.string().optional(),
      timeout: z.number().optional(),
    },
    async (args) => {
      const result = await runCommand(args);
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(result, null, 2) },
        ],
        isError: result.exitCode !== 0,
      };
    },
  );

  server.tool(
    "open_url",
    "Open a URL in the default browser or an app scheme.",
    { url: z.string() },
    async (args) => ({
      content: [{ type: "text" as const, text: await openUrl(args) }],
    }),
  );

  server.tool(
    "get_clipboard",
    "Read the current text contents of the system clipboard.",
    {},
    async () => ({
      content: [{ type: "text" as const, text: await getClipboard() }],
    }),
  );

  server.tool(
    "set_clipboard",
    "Write text to the system clipboard.",
    { text: z.string() },
    async (args) => ({
      content: [{ type: "text" as const, text: await setClipboard(args) }],
    }),
  );

  // --- Tier 2: Context Awareness ---

  server.tool(
    "get_frontmost_app",
    "Get the currently focused application name, window title, and browser tab URL.",
    {},
    async () => {
      const info = await getFrontmostApp();
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(info, null, 2) },
        ],
      };
    },
  );

  server.tool(
    "paste_text",
    "Paste text into the currently focused application.",
    { text: z.string() },
    async (args) => ({
      content: [{ type: "text" as const, text: await pasteText(args) }],
    }),
  );

  if (IS_MACOS) {
    server.tool(
      "run_shortcut",
      "Run a macOS Shortcut by name with optional input.",
      { name: z.string(), input: z.string().optional() },
      async (args) => ({
        content: [{ type: "text" as const, text: await runShortcut(args) }],
      }),
    );
  }

  // --- Tier 3: Power Tools ---

  server.tool(
    "take_screenshot",
    "Capture a full-resolution screenshot. Returns a file path.",
    {},
    async () => {
      const result = await takeScreenshot();
      return {
        content: [{ type: "text" as const, text: result }],
      };
    },
  );
}

/** Number of built-in tools (for UI display). */
export const BUILTIN_TOOL_COUNT = Object.keys(getBuiltinTools()).length;
