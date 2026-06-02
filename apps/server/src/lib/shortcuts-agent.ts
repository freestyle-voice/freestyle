import type { LanguageModel, Tool } from "ai";
import { generateText, jsonSchema, stepCountIs } from "ai";
import { executeAction } from "./actions.js";
import { getDb } from "./db.js";
import {
  executeShortcut,
  extractVariableNames,
  interpolate,
  triggerToRegex,
} from "./shortcut-executor.js";

interface StepRow {
  action: string;
  value: string;
  position: number;
}

interface ShortcutEntry {
  id: number;
  key: string;
  description: string | null;
  steps: StepRow[];
}

export function loadShortcuts(): ShortcutEntry[] {
  const db = getDb();
  const rows = db
    .prepare(
      "SELECT id, key, description FROM shortcuts ORDER BY length(key) DESC",
    )
    .all() as unknown as {
    id: number;
    key: string;
    description: string | null;
  }[];

  return rows.map((row) => {
    const steps = db
      .prepare(
        "SELECT action, value, position FROM shortcut_steps WHERE shortcut_id = ? ORDER BY position ASC",
      )
      .all(row.id) as unknown as StepRow[];
    return { ...row, steps };
  });
}

export function buildUserShortcutsContext(entries: ShortcutEntry[]): string {
  if (entries.length === 0) return "No shortcuts are configured.";

  const lines = entries.map((e) => {
    const vars = extractVariableNames(e.key);
    const varInfo = vars.length > 0 ? ` (variables: ${vars.join(", ")})` : "";
    const desc = e.description ? ` — ${e.description}` : "";
    const stepsInfo = e.steps.map((s) => `${s.action}: ${s.value}`).join("; ");
    return `- ID ${e.id}: "${e.key}"${varInfo}${desc} [${stepsInfo}]`;
  });
  return `Available shortcuts:\n${lines.join("\n")}`;
}

export function buildSystemPrompt(
  contextHint: string,
  userShortcuts: string,
): string {
  return `You are a voice-command assistant. The user speaks commands, dictation, or a mix of both.

Your job:
1. Identify if the spoken text matches or is close to a shortcut trigger phrase.
2. If a shortcut matches, call execute_shortcut with the shortcut ID and any extracted variables.
3. If the user asks to open an app, call open_app.
4. If the user asks to open a URL, call open_url.
5. If the user asks to paste clipboard, call paste_clipboard.
6. For pure dictation (no command intent), return the cleaned text as-is.
7. For mixed input (command + dictation), execute the command and return remaining dictation.

${contextHint ? `Context: ${contextHint}\n` : ""}
${userShortcuts}

Rules:
- Match triggers case-insensitively and flexibly (the user is speaking, not typing).
- Extract variables from the spoken text when the trigger has {variable} placeholders.
- Only call tools when you detect command intent. Do not call tools for pure dictation.
- Return the final text the user intended to type. If only commands were spoken, return an empty string.
- Do NOT add explanations or commentary. Your entire response must be the cleaned text output.`;
}

export async function runShortcutsAgent(
  rawText: string,
  contextHint: string,
  chatModel: LanguageModel,
  modelId: string,
): Promise<{
  cleaned: string;
  actionsExecuted: string[];
  inputTokens: number;
  outputTokens: number;
}> {
  const entries = loadShortcuts();
  const userShortcuts = buildUserShortcutsContext(entries);
  const systemPrompt = buildSystemPrompt(contextHint, userShortcuts);
  const actionsExecuted: string[] = [];

  const tools: Record<string, Tool> = {
    execute_shortcut: {
      description: "Execute a shortcut by ID with optional variables",
      inputSchema: jsonSchema({
        type: "object" as const,
        properties: {
          id: { type: "number", description: "Shortcut ID" },
          variables: {
            type: "object",
            description:
              "Variable name-value pairs extracted from the spoken text",
            additionalProperties: { type: "string" },
          },
        },
        required: ["id"],
      }),
      execute: async (args: Record<string, unknown>) => {
        const id = args.id as number;
        const variables = (args.variables as Record<string, string>) ?? {};
        const result = await executeShortcut(id, variables);
        actionsExecuted.push(...result.actionsExecuted);
        return { text: result.text, actionsExecuted: result.actionsExecuted };
      },
    },
    open_app: {
      description: "Open an application by name",
      inputSchema: jsonSchema({
        type: "object" as const,
        properties: {
          name: { type: "string", description: "Application name" },
        },
        required: ["name"],
      }),
      execute: async (args: Record<string, unknown>) => {
        const name = args.name as string;
        const result = await executeAction("open_app", { name });
        actionsExecuted.push(`open_app:${name}`);
        return result;
      },
    },
    open_url: {
      description: "Open a URL in the browser",
      inputSchema: jsonSchema({
        type: "object" as const,
        properties: {
          url: { type: "string", description: "URL to open" },
        },
        required: ["url"],
      }),
      execute: async (args: Record<string, unknown>) => {
        const url = args.url as string;
        const result = await executeAction("open_url", { url });
        actionsExecuted.push(`open_url:${url}`);
        return result;
      },
    },
    paste_clipboard: {
      description: "Paste the current clipboard contents",
      inputSchema: jsonSchema({
        type: "object" as const,
        properties: {},
      }),
      execute: async () => {
        const result = await executeAction("paste_clipboard", {});
        actionsExecuted.push("paste_clipboard");
        return result;
      },
    },
  };

  const result = await generateText({
    model: chatModel,
    system: systemPrompt,
    prompt: rawText,
    tools,
    stopWhen: stepCountIs(5),
    temperature: 0,
  });

  return {
    cleaned: result.text,
    actionsExecuted,
    inputTokens: result.usage?.inputTokens ?? 0,
    outputTokens: result.usage?.outputTokens ?? 0,
  };
}

export function applyShortcutsFallback(
  text: string,
  entries: ShortcutEntry[],
): { cleaned: string; actionsExecuted: string[] } {
  let remaining = text;
  const actionsExecuted: string[] = [];

  for (const entry of entries) {
    const vars = extractVariableNames(entry.key);
    if (vars.length > 0) {
      const regex = triggerToRegex(entry.key);
      const match = remaining.match(regex);
      if (match?.groups) {
        const variables: Record<string, string> = {};
        for (const v of vars) {
          variables[v] = match.groups[v] ?? "";
        }
        const replaceSteps = entry.steps.filter((s) => s.action === "replace");
        if (replaceSteps.length > 0) {
          const replacement = replaceSteps
            .map((s) => interpolate(s.value, variables))
            .join("");
          remaining = remaining.replace(match[0], replacement);
        }
      }
    } else {
      const escaped = entry.key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(`\\b${escaped}\\b`, "gi");
      if (regex.test(remaining)) {
        const replaceSteps = entry.steps.filter((s) => s.action === "replace");
        if (replaceSteps.length > 0) {
          const replacement = replaceSteps.map((s) => s.value).join("");
          remaining = remaining.replace(
            new RegExp(`\\b${escaped}\\b`, "gi"),
            replacement,
          );
        }
      }
    }
  }

  return { cleaned: remaining, actionsExecuted };
}
