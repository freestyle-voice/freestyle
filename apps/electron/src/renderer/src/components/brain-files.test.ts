import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const { useQuery, useQueryClient } = vi.hoisted(() => ({
  useQuery: vi.fn(),
  useQueryClient: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({ useQuery, useQueryClient }));
vi.mock("@renderer/components/markdown", () => ({
  Markdown: () => null,
}));
vi.mock("@renderer/lib/brain-fs", () => ({
  deleteBrainFile: vi.fn(),
  listBrainFiles: vi.fn(),
  readBrainFile: vi.fn(),
  writeBrainFile: vi.fn(),
}));

import { BrainFiles } from "./brain-files";

describe("BrainFiles", () => {
  it("shows a loading skeleton before its file list arrives", () => {
    useQuery.mockReturnValue({ data: undefined, isLoading: true });
    useQueryClient.mockReturnValue({ invalidateQueries: vi.fn() });

    const html = renderToStaticMarkup(
      createElement(BrainFiles, {
        root: "",
        emptyText: "No files",
        newLabel: "New file",
      }),
    );

    expect(html).toContain('aria-label="Loading Brain files"');
    expect(html).not.toContain("No files");
  });

  it("shows a retryable error when its file list cannot load", () => {
    useQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: vi.fn(),
    });
    useQueryClient.mockReturnValue({ invalidateQueries: vi.fn() });

    const html = renderToStaticMarkup(
      createElement(BrainFiles, {
        root: "",
        emptyText: "No files",
        newLabel: "New file",
      }),
    );

    expect(html).toContain("Couldn&#x27;t load Brain files.");
    expect(html).toContain("Try again");
  });
});
