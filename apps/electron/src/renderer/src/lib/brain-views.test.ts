import { describe, expect, it, vi } from "vitest";

const { listBrainFiles, readBrainFile } = vi.hoisted(() => ({
  listBrainFiles: vi.fn(),
  readBrainFile: vi.fn(),
}));

vi.mock("@renderer/lib/brain-fs", () => ({ listBrainFiles, readBrainFile }));

import { notesQueryOptions } from "./query";

describe("Brain view query options", () => {
  it("loads note summaries in most-recent-first order", async () => {
    listBrainFiles.mockResolvedValue([
      { path: "notes/older.md", modified: 1 },
      { path: "notes/newer.md", modified: 2 },
    ]);
    readBrainFile.mockImplementation(async (path: string) =>
      path === "notes/older.md"
        ? "# Older\nEarlier work"
        : "# Newer\nFresh work",
    );

    const options = notesQueryOptions();
    await expect(options.queryFn()).resolves.toEqual([
      {
        path: "notes/newer.md",
        title: "Newer",
        snippet: "Fresh work",
        modified: 2,
      },
      {
        path: "notes/older.md",
        title: "Older",
        snippet: "Earlier work",
        modified: 1,
      },
    ]);
  });
});
