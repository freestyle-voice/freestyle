/**
 * Shortcuts agent — an LLM-powered router that handles both text cleanup
 * and action execution in a single call.
 *
 * The agent receives transcribed speech and:
 * 1. Detects if it contains commands (open app, open URL, etc.)
 * 2. Executes actions via AI SDK tool calls
 * 3. Cleans up any remaining dictation text
 * 4. Applies user-defined replacement shortcuts
 *
 * Returns the cleaned text (if any) and a list of actions executed.
 */

import type { LanguageModel, Tool } from "ai";
import { generateText, jsonSchema, stepCountIs } from "ai";
import { executeAction } from "./actions.js";
import { getDb } from "./db.js";

export interface ShortcutEntry {
  id: number;
  key: string;
  value: string;
  action: string;
}

export interface AgentResult {
  text: string | null;
  actionsExecuted: string[];
  inputTokens: number;
  outputTokens: number;
}

function loadShortcuts(): ShortcutEntry[] {
  try {
    const db = getDb();
    return db
      .prepare(
        "SELECT id, key, value, action FROM shortcuts ORDER BY length(key) DESC",
      )
      .all() as unknown as ShortcutEntry[];
  } catch {
    return [];
  }
}

function buildUserShortcutsContext(entries: ShortcutEntry[]): string {
  const replaceEntries = entries.filter((e) => e.action === "replace");
  const urlEntries = entries.filter((e) => e.action === "open_url");

  const lines: string[] = [];

  if (replaceEntries.length > 0) {
    lines.push(
      "User-defined text replacements (apply these when the phrase appears in dictation):",
    );
    for (const e of replaceEntries) {
      lines.push(`  - "${e.key}" → replace with "${e.value}"`);
    }
  }

  if (urlEntries.length > 0) {
    lines.push("User-defined URL shortcuts:");
    for (const e of urlEntries) {
      lines.push(`  - When the user says "${e.key}", open URL: ${e.value}`);
    }
  }

  return lines.join("\n");
}

function buildSystemPrompt(contextHint: string, userShortcuts: string): string {
  return `You are a voice assistant that processes transcribed speech. Your job is to analyze the transcription and determine what the user wants:

1. **Commands**: If the user is giving a command (e.g., "open Slack", "go to GitHub", "paste clipboard"), execute the appropriate action using the available tools. Do NOT include the command portion in your text output.

2. **Dictation**: If the user is dictating text to be typed, clean it up:
   - Remove filler words (um, uh)
   - Remove false starts, repeated words, and self-corrections
   - Fix punctuation, capitalization, and grammar
   - Convert spoken numbers, dates, and units to written form
   - Clean spoken artifacts: "dot" → ".", "at sign" → "@", "slash" → "/", "hashtag" → "#", "dash" → "-"
   - Smooth awkward phrasing without changing meaning
   - Break run-on sentences where the speaker intended a pause

3. **Mixed**: The transcription can contain both commands AND dictation. Execute the commands and return the cleaned dictation text.

${contextHint ? `Context: ${contextHint}\n` : ""}
${userShortcuts ? `${userShortcuts}\n` : ""}
Rules:
- Preserve the speaker's meaning and tone
- Do NOT add information the speaker did not convey
- Do NOT summarize or omit content
- If the transcript is only a command with no dictation text, return an empty string
- If the transcript is only filler words or silence, return an empty string
- Do NOT include hidden reasoning or commentary
- Your response must be ONLY the cleaned text (or empty string). No quotes, no explanations.`;
}

export async function runShortcutsAgent(
  rawText: string,
  contextHint: string,
  chatModel: LanguageModel,
  modelId: string,
): Promise<AgentResult> {
  const shortcuts = loadShortcuts();
  const userShortcuts = buildUserShortcutsContext(shortcuts);

  const actionsExecuted: string[] = [];

  const tools: Record<string, Tool> = {
    open_app: {
      description:
        "Open an application on the user's computer. Use this when the user says things like 'open Slack', 'launch Chrome', 'start Terminal'.",
      inputSchema: jsonSchema({
        type: "object" as const,
        properties: {
          name: {
            type: "string",
            description:
              "The name of the application to open (e.g., 'Slack', 'Chrome', 'Terminal')",
          },
        },
        required: ["name"],
      }),
      execute: async ({ name }: { name: string }) => {
        const result = await executeAction("open_app", { name });
        actionsExecuted.push(`open_app: ${name}`);
        return (
          result.message ??
          (result.ok ? `Opened ${name}` : `Failed to open ${name}`)
        );
      },
    },
    open_url: {
      description:
        "Open a URL in the user's default browser. Use this when the user says things like 'go to github.com', 'open google.com', or triggers a user-defined URL shortcut.",
      inputSchema: jsonSchema({
        type: "object" as const,
        properties: {
          url: {
            type: "string",
            description:
              "The full URL to open (include https:// if not present)",
          },
        },
        required: ["url"],
      }),
      execute: async ({ url }: { url: string }) => {
        const fullUrl = url.startsWith("http") ? url : `https://${url}`;
        const result = await executeAction("open_url", { url: fullUrl });
        actionsExecuted.push(`open_url: ${fullUrl}`);
        return (
          result.message ??
          (result.ok ? `Opened ${fullUrl}` : `Failed to open ${fullUrl}`)
        );
      },
    },
    paste_clipboard: {
      description:
        "Paste the current clipboard contents. Use this when the user says things like 'paste clipboard', 'paste what I copied'.",
      inputSchema: jsonSchema({
        type: "object" as const,
        properties: {},
      }),
      execute: async () => {
        const result = await executeAction("paste_clipboard", {});
        actionsExecuted.push("paste_clipboard");
        return result.message ?? "Pasted clipboard contents";
      },
    },
  };

  const systemPrompt = buildSystemPrompt(contextHint, userShortcuts);

  const result = await generateText({
    model: chatModel,
    system: systemPrompt,
    prompt: `<transcript>\n${rawText}\n</transcript>`,
    tools,
    stopWhen: stepCountIs(5),
    temperature: 0,
  });

  let cleanedText = result.text.trim();

  // Strip <think> tags from Qwen models
  if (modelId.toLowerCase().includes("qwen")) {
    cleanedText = cleanedText
      .replace(/^<think>[\s\S]*?<\/think>\s*/i, "")
      .trim();
  }

  // Apply user-defined replace shortcuts as a fallback for any the LLM missed
  const replaceShortcuts = shortcuts.filter((e) => e.action === "replace");
  if (replaceShortcuts.length > 0 && cleanedText) {
    const matchedIds: number[] = [];
    for (const { id, key, value } of replaceShortcuts) {
      const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(`\\b${escaped}\\b`, "gi");
      if (regex.test(cleanedText)) {
        matchedIds.push(id);
        cleanedText = cleanedText.replace(
          new RegExp(`\\b${escaped}\\b`, "gi"),
          value,
        );
      }
    }
    if (matchedIds.length > 0) {
      try {
        const db = getDb();
        const updateStmt = db.prepare(
          "UPDATE shortcuts SET usage_count = usage_count + 1 WHERE id = ?",
        );
        for (const id of matchedIds) {
          updateStmt.run(id);
        }
      } catch {}
    }
  }

  // Track usage for URL shortcuts that were triggered
  const urlShortcuts = shortcuts.filter((e) => e.action === "open_url");
  if (urlShortcuts.length > 0) {
    const matchedUrlIds: number[] = [];
    for (const { id, value } of urlShortcuts) {
      if (actionsExecuted.some((a) => a.includes(value))) {
        matchedUrlIds.push(id);
      }
    }
    if (matchedUrlIds.length > 0) {
      try {
        const db = getDb();
        const updateStmt = db.prepare(
          "UPDATE shortcuts SET usage_count = usage_count + 1 WHERE id = ?",
        );
        for (const id of matchedUrlIds) {
          updateStmt.run(id);
        }
      } catch {}
    }
  }

  return {
    text: cleanedText || null,
    actionsExecuted,
    inputTokens: result.usage?.inputTokens ?? 0,
    outputTokens: result.usage?.outputTokens ?? 0,
  };
}
