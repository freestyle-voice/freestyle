import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const { useInfiniteQuery, useQueryClient } = vi.hoisted(() => ({
  useInfiniteQuery: vi.fn(),
  useQueryClient: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({ useInfiniteQuery, useQueryClient }));
vi.mock("@renderer/lib/analytics", () => ({ capture: vi.fn() }));

import { ThreadHistory } from "./thread-history";

describe("ThreadHistory", () => {
  it("keeps the conversation filters available while briefs load", () => {
    useInfiniteQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
    });
    useQueryClient.mockReturnValue({ fetchQuery: vi.fn() });

    const html = renderToStaticMarkup(
      createElement(ThreadHistory, {
        currentId: "active-thread",
        onPick: vi.fn(),
      }),
    );

    expect(html).toContain("Conversations");
    expect(html).toContain("Briefs");
    expect(html).toContain("Loading conversations…");
  });
});
