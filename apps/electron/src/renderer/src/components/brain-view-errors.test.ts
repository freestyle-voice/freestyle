import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const { useQuery, useQueryClient } = vi.hoisted(() => ({
  useQuery: vi.fn(),
  useQueryClient: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({ useQuery, useQueryClient }));
vi.mock("@renderer/components/markdown", () => ({ Markdown: () => null }));
vi.mock("@renderer/lib/brain-fs", () => ({
  deleteBrainFile: vi.fn(),
  listBrainFiles: vi.fn(),
  peekBrainFile: vi.fn(),
  peekBrainFiles: vi.fn(),
  readBrainFile: vi.fn(),
  writeBrainFile: vi.fn(),
}));

import { NotesTab } from "./notes-tab";
import { ScheduledTasks } from "./scheduled-tasks";

const componentDir = new URL(".", import.meta.url);

describe("Brain view errors", () => {
  it("moves a selected note into a shaped loading state while its contents load", async () => {
    const source = await import("node:fs/promises").then(({ readFile }) =>
      readFile(new URL("notes-tab.tsx", componentDir), "utf8"),
    );

    expect(source).toContain('{ kind: "loading"; path: string }');
    expect(source).toContain('DataSkeleton label="Loading note"');
    expect(source).not.toContain(".catch(() => {});");
    expect(source).toContain("try {\n      const current");
  });

  it("moves a selected Brain file into a shaped loading state while it opens", async () => {
    const source = await import("node:fs/promises").then(({ readFile }) =>
      readFile(new URL("brain-files.tsx", componentDir), "utf8"),
    );

    expect(source).toContain('{ kind: "loading"; path: string }');
    expect(source).toContain('DataSkeleton label="Loading Brain file"');
    expect(source).not.toContain(".catch(() => {});");
  });

  it("lets the user retry a failed note load", () => {
    useQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: vi.fn(),
    });
    useQueryClient.mockReturnValue({ invalidateQueries: vi.fn() });

    const html = renderToStaticMarkup(createElement(NotesTab));

    expect(html).toContain("Couldn&#x27;t load notes.");
    expect(html).toContain("Try again");
  });

  it("lets the user retry a failed scheduled-task load", () => {
    useQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: vi.fn(),
    });
    useQueryClient.mockReturnValue({ invalidateQueries: vi.fn() });

    const html = renderToStaticMarkup(createElement(ScheduledTasks));

    expect(html).toContain("Couldn&#x27;t load scheduled tasks.");
    expect(html).toContain("Try again");
  });
});
