import { apiFetch } from "@renderer/lib/api";
import { listBrainFiles, readBrainFile } from "@renderer/lib/brain-fs";

export type NoteSummary = {
  path: string;
  title: string;
  snippet: string;
  modified: number;
};

function noteLines(text: string): { title: string; snippet: string } {
  const lines = text
    .split("\n")
    .map((line) => line.replace(/^#+\s*/, "").trim())
    .filter(Boolean);
  return {
    title: lines[0] ?? "New note",
    snippet: lines[1] ?? "",
  };
}

export async function listNoteSummaries(): Promise<NoteSummary[]> {
  const files = await listBrainFiles("notes");
  const summaries = await Promise.all(
    files.map(async (file) => {
      const path = file.path.replace(/\\/g, "/");
      const text = (await readBrainFile(path)) ?? "";
      return { path, ...noteLines(text), modified: file.modified };
    }),
  );
  return summaries.sort((a, b) => b.modified - a.modified);
}

export type ScheduledTaskView = {
  path: string;
  name: string;
  schedule: string;
  enabled: boolean;
  lastRun: Date | null;
  content: string;
};

function field(frontmatter: string, key: string): string | null {
  const match = new RegExp(`^\\s*${key}\\s*:\\s*(.*)$`, "im").exec(frontmatter);
  if (!match) return null;
  return match[1].trim().replace(/^["']|["']$/g, "") || null;
}

function parseScheduledTask(
  path: string,
  content: string,
): ScheduledTaskView | null {
  const normalized = content.replace(/\r\n/g, "\n");
  const match = /^\s*-{3,}\s*\n([\s\S]*?)\n-{3,}\s*\n?/.exec(normalized);
  if (!match) return null;
  const frontmatter = match[1];
  const schedule = field(frontmatter, "schedule");
  if (!schedule) return null;

  const enabledRaw = field(frontmatter, "enabled")?.toLowerCase() ?? "true";
  const lastRunRaw = field(frontmatter, "last_run");
  const lastRun = lastRunRaw ? new Date(lastRunRaw) : null;

  return {
    path,
    name:
      field(frontmatter, "name") ??
      (path.split("/").pop() ?? path).replace(/\.md$/i, ""),
    schedule,
    enabled: !["false", "no", "off", "0"].includes(enabledRaw),
    lastRun: lastRun && !Number.isNaN(lastRun.getTime()) ? lastRun : null,
    content: normalized,
  };
}

export async function listScheduledTaskViews(): Promise<ScheduledTaskView[]> {
  const files = await listBrainFiles("scheduled_tasks");
  const tasks = await Promise.all(
    files.map(async (file) => {
      const content = await readBrainFile(file.path);
      return content ? parseScheduledTask(file.path, content) : null;
    }),
  );
  return tasks
    .filter((task): task is ScheduledTaskView => task !== null)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function toggleScheduledTaskEnabled(
  content: string,
  next: boolean,
): string {
  const value = next ? "true" : "false";
  if (/^\s*enabled\s*:/im.test(content)) {
    return content.replace(/^(\s*)enabled\s*:.*$/im, `$1enabled: ${value}`);
  }
  return content.replace(/^(\s*-{3,}\s*\n)/, `$1enabled: ${value}\n`);
}

export type ScheduledRunTimes = Record<string, number | null>;

export async function fetchScheduledRunTimes(): Promise<ScheduledRunTimes> {
  const response = await apiFetch("/api/scheduled/tasks");
  if (!response.ok) throw new Error("Could not load run times.");
  const data = (await response.json()) as {
    tasks?: Array<{ path: string; nextRun: number | null }>;
  };
  return Object.fromEntries(
    (data.tasks ?? []).map((task) => [task.path, task.nextRun]),
  );
}

export async function runScheduledTaskNow(path: string): Promise<void> {
  const response = await apiFetch("/api/scheduled/run-task", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path }),
  });
  if (!response.ok) throw new Error("Could not run that task.");
}
