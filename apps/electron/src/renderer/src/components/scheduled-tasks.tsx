import {
  listBrainFiles,
  readBrainFile,
  writeBrainFile,
} from "@renderer/lib/brain-fs";
import type React from "react";
import { useCallback, useEffect, useState } from "react";

const PREFIX = "scheduled_tasks";

interface ScheduledTaskView {
  path: string;
  name: string;
  schedule: string;
  enabled: boolean;
  lastRun: Date | null;
  content: string;
}

function field(frontmatter: string, key: string): string | null {
  const match = new RegExp(`^\\s*${key}\\s*:\\s*(.*)$`, "im").exec(frontmatter);
  if (!match) return null;
  return match[1].trim().replace(/^["']|["']$/g, "") || null;
}

function parse(path: string, content: string): ScheduledTaskView | null {
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

function toggleEnabled(content: string, next: boolean): string {
  const value = next ? "true" : "false";
  if (/^\s*enabled\s*:/im.test(content)) {
    return content.replace(/^(\s*)enabled\s*:.*$/im, `$1enabled: ${value}`);
  }
  return content.replace(/^(\s*-{3,}\s*\n)/, `$1enabled: ${value}\n`);
}

function whenLastRun(date: Date | null): string {
  if (!date) return "never run";
  const diffMin = Math.round((Date.now() - date.getTime()) / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffMin < 60 * 24) return `${Math.round(diffMin / 60)}h ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function ScheduledTasks(): React.JSX.Element {
  const [tasks, setTasks] = useState<ScheduledTaskView[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback((): void => {
    void listBrainFiles(PREFIX)
      .then(async (files) => {
        const parsed: ScheduledTaskView[] = [];
        for (const file of files) {
          const content = await readBrainFile(file.path);
          if (!content) continue;
          const task = parse(file.path, content);
          if (task) parsed.push(task);
        }
        return parsed.sort((a, b) => a.name.localeCompare(b.name));
      })
      .catch(() => [])
      .then(setTasks);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = (task: ScheduledTaskView): void => {
    const next = !task.enabled;
    setBusy(task.path);
    setTasks(
      (prev) =>
        prev?.map((t) =>
          t.path === task.path ? { ...t, enabled: next } : t,
        ) ?? prev,
    );
    void writeBrainFile(task.path, toggleEnabled(task.content, next))
      .then((ok) => {
        if (!ok) load();
      })
      .catch(() => load())
      .finally(() => setBusy(null));
  };

  if (tasks === null)
    return <div className="tavern-empty">Loading scheduled tasks…</div>;

  if (tasks.length === 0)
    return (
      <div className="tavern-empty">
        Nothing scheduled. Ask Jeb to do something regularly — "check the stocks
        every weekday morning" — and it lands here.
      </div>
    );

  return (
    <>
      <p className="tavern-set-hint is-lead">
        These run on their own, even with this app closed. Every run sends you a
        notification.
      </p>
      {tasks.map((task) => (
        <div
          key={task.path}
          className={`tavern-sched${task.enabled ? "" : " is-off"}`}
        >
          <div className="tavern-sched-head">
            <span className="tavern-sched-name">{task.name}</span>
            <button
              type="button"
              className={`tavern-sched-toggle${task.enabled ? " is-on" : ""}`}
              disabled={busy === task.path}
              onClick={() => toggle(task)}
            >
              {task.enabled ? "On" : "Off"}
            </button>
          </div>
          <p className="tavern-sched-schedule">{task.schedule}</p>
          <span className="tavern-sched-meta">{whenLastRun(task.lastRun)}</span>
        </div>
      ))}
    </>
  );
}
