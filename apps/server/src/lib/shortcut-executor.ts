import { executeAction } from "./actions.js";
import { getDb } from "./db.js";

interface StepRow {
  id: number;
  shortcut_id: number;
  position: number;
  action: string;
  value: string;
}

export function extractVariableNames(trigger: string): string[] {
  const matches = trigger.match(/\{(\w+)\}/g);
  if (!matches) return [];
  return matches.map((m) => m.slice(1, -1));
}

export function triggerToRegex(trigger: string): RegExp {
  const escaped = trigger.replace(/[.*+?^${}()|[\]\\]/g, (ch) => {
    if (ch === "{" || ch === "}") return ch;
    return `\\${ch}`;
  });
  const pattern = escaped.replace(/\{(\w+)\}/g, "(?<$1>.+?)");
  return new RegExp(`^${pattern}$`, "i");
}

export function interpolate(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(/\{(\w+)\}/g, (_, name) => vars[name] ?? "");
}

export function evaluateCondition(
  vars: Record<string, string>,
  config: { variable: string; operator: string; operand?: string },
): boolean {
  const val = vars[config.variable] ?? "";
  const operand = config.operand ?? "";

  switch (config.operator) {
    case "equals":
      return val.toLowerCase() === operand.toLowerCase();
    case "contains":
      return val.toLowerCase().includes(operand.toLowerCase());
    case "starts_with":
      return val.toLowerCase().startsWith(operand.toLowerCase());
    case "ends_with":
      return val.toLowerCase().endsWith(operand.toLowerCase());
    case "is_empty":
      return val.trim() === "";
    case "not_empty":
      return val.trim() !== "";
    default:
      return false;
  }
}

export function applyTransform(value: string, operations: string[]): string {
  let result = value;
  for (const op of operations) {
    if (op === "trim") {
      result = result.trim();
    } else if (op === "lowercase") {
      result = result.toLowerCase();
    } else if (op === "uppercase") {
      result = result.toUpperCase();
    } else if (op === "url_encode") {
      result = encodeURIComponent(result);
    } else if (op.startsWith("default:")) {
      if (!result.trim()) {
        result = op.slice("default:".length);
      }
    } else if (op.startsWith("replace:")) {
      const parts = op.slice("replace:".length).split(":");
      if (parts.length >= 2) {
        const [from, ...rest] = parts;
        const to = rest.join(":");
        result = result.split(from).join(to);
      }
    }
  }
  return result;
}

export async function executeSteps(
  steps: StepRow[],
  vars: Record<string, string>,
  actionsExecuted: string[],
  textParts: string[],
): Promise<void> {
  for (const step of steps) {
    const interpolatedValue = interpolate(step.value, vars);

    switch (step.action) {
      case "replace": {
        textParts.push(interpolatedValue);
        break;
      }
      case "open_app": {
        const result = await executeAction("open_app", {
          name: interpolatedValue,
        });
        actionsExecuted.push(`open_app:${interpolatedValue}`);
        if (!result.ok && result.message) {
          console.warn(`[shortcut] open_app failed: ${result.message}`);
        }
        break;
      }
      case "open_url": {
        const result = await executeAction("open_url", {
          url: interpolatedValue,
        });
        actionsExecuted.push(`open_url:${interpolatedValue}`);
        if (!result.ok && result.message) {
          console.warn(`[shortcut] open_url failed: ${result.message}`);
        }
        break;
      }
      case "paste_clipboard": {
        const result = await executeAction("paste_clipboard", {});
        actionsExecuted.push("paste_clipboard");
        if (!result.ok && result.message) {
          console.warn(`[shortcut] paste_clipboard failed: ${result.message}`);
        }
        break;
      }
      case "if": {
        try {
          const config = JSON.parse(interpolatedValue) as {
            variable: string;
            operator: string;
            operand?: string;
            then?: StepRow[];
            else?: StepRow[];
          };
          const conditionMet = evaluateCondition(vars, config);
          const branch = conditionMet ? config.then : config.else;
          if (branch && branch.length > 0) {
            await executeSteps(branch, vars, actionsExecuted, textParts);
          }
        } catch {
          console.warn("[shortcut] Failed to parse if-step value");
        }
        break;
      }
      case "transform": {
        try {
          const config = JSON.parse(interpolatedValue) as {
            variable: string;
            operations: string[];
          };
          const currentVal = vars[config.variable] ?? "";
          vars[config.variable] = applyTransform(currentVal, config.operations);
        } catch {
          console.warn("[shortcut] Failed to parse transform-step value");
        }
        break;
      }
    }
  }
}

export async function executeShortcut(
  shortcutId: number,
  variables: Record<string, string>,
): Promise<{ text: string; actionsExecuted: string[] }> {
  const db = getDb();
  const steps = db
    .prepare(
      "SELECT * FROM shortcut_steps WHERE shortcut_id = ? ORDER BY position ASC",
    )
    .all(shortcutId) as unknown as StepRow[];

  const now = new Date();
  const builtInVars: Record<string, string> = {
    date: now.toISOString().slice(0, 10),
    time: now.toTimeString().slice(0, 5),
  };
  const vars = { ...builtInVars, ...variables };

  const actionsExecuted: string[] = [];
  const textParts: string[] = [];

  await executeSteps(steps, vars, actionsExecuted, textParts);

  db.prepare(
    "UPDATE shortcuts SET usage_count = usage_count + 1, updated_at = datetime('now') WHERE id = ?",
  ).run(shortcutId);

  return { text: textParts.join(""), actionsExecuted };
}
