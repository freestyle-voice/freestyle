import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const { useQuery, useQueryClient } = vi.hoisted(() => ({
  useQuery: vi.fn(),
  useQueryClient: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({ useQuery, useQueryClient }));
vi.mock("@renderer/components/markdown", () => ({
  Markdown: ({ text }: { text: string }) => createElement("pre", null, text),
}));
vi.mock("@renderer/lib/brain-fs", () => ({
  deleteBrainFile: vi.fn(),
  listBrainFiles: vi.fn(),
  readBrainFile: vi.fn(),
  writeBrainFile: vi.fn(),
}));
vi.mock("@renderer/lib/scheduled-tasks", () => ({
  createScheduledTask: vi.fn(),
  deleteScheduledTask: vi.fn(),
  listScheduledTasks: vi.fn(),
  runScheduledTaskNow: vi.fn(),
  updateScheduledTask: vi.fn(),
}));

import { BrainFiles } from "./brain-files";
import { ScheduledTasks } from "./scheduled-tasks";

const task = {
  id: "task-1",
  name: "Morning brief",
  instruction: "Check the **markets**.",
  schedule: "every weekday at 8am",
  cron: "0 8 * * 1-5",
  kind: "cron" as const,
  timezone: "America/Los_Angeles",
  enabled: true,
  nextDueAt: new Date(Date.now() + 3_600_000).toISOString(),
  lastCompletedAt: null,
  templateId: null,
};

function mockQueries({
  tasks,
  files,
}: {
  tasks: unknown[];
  files: unknown[];
}): void {
  useQuery.mockImplementation((options: { queryKey: readonly string[] }) => ({
    data: options.queryKey[0] === "scheduled" ? tasks : files,
    isLoading: false,
    isError: false,
    isSuccess: true,
  }));
  useQueryClient.mockReturnValue({
    invalidateQueries: vi.fn(),
    getQueryData: vi.fn(),
    setQueryData: vi.fn(),
  });
}

describe("ScheduledTasks", () => {
  it("lists tasks as cards with schedule and next run", () => {
    mockQueries({ tasks: [task], files: [] });
    const html = renderToStaticMarkup(createElement(ScheduledTasks));
    expect(html).toContain("Morning brief");
    expect(html).toContain("every weekday at 8am");
    expect(html).toContain("next in 1h");
    expect(html).toContain("never run");
    expect(html).toContain("New scheduled task");
    expect(html).toContain('aria-label="Run Morning brief now"');
    expect(html).toContain('role="switch"');
    expect(html).not.toContain("Check the");
  });

  it("explains how to get a task when there are none", () => {
    mockQueries({ tasks: [], files: [] });
    const html = renderToStaticMarkup(
      createElement(ScheduledTasks, { mascot: "Bramble" }),
    );
    expect(html).toContain("Ask Bramble to do something regularly");
  });
});

describe("Brain tab", () => {
  it("shows the Scheduled section above the file tree", () => {
    mockQueries({
      tasks: [task],
      files: [{ path: "notes/a.md", size: 3, modified: 0 }],
    });
    const html = renderToStaticMarkup(
      createElement(BrainFiles, {
        root: "",
        emptyText: "No files",
        newLabel: "New file",
      }),
    );
    expect(html.indexOf("Morning brief")).toBeGreaterThan(-1);
    expect(html.indexOf("Morning brief")).toBeLessThan(html.indexOf("a.md"));
  });

  it("keeps folder views free of the Scheduled section", () => {
    mockQueries({
      tasks: [task],
      files: [{ path: "notes/a.md", size: 3, modified: 0 }],
    });
    const html = renderToStaticMarkup(
      createElement(BrainFiles, {
        root: "notes",
        emptyText: "No notes",
        newLabel: "New note",
      }),
    );
    expect(html).not.toContain("Morning brief");
  });
});
