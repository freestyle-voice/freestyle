import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { useInfiniteQuery, useQueryClient } = vi.hoisted(() => ({
  useInfiniteQuery: vi.fn(),
  useQueryClient: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({ useInfiniteQuery, useQueryClient }));
vi.mock("@renderer/lib/analytics", () => ({ capture: vi.fn() }));

import { ThreadHistory } from "./thread-history";

describe("ThreadHistory", () => {
  beforeEach(() => {
    useInfiniteQuery.mockReset();
    useQueryClient.mockReset();
    useQueryClient.mockReturnValue({ fetchQuery: vi.fn() });
  });

  it("merges conversations and scheduled briefs into one time-ordered list", () => {
    useInfiniteQuery
      .mockReturnValueOnce({
        data: {
          pages: [
            {
              threads: [
                { id: "conversation", title: "Plan the launch", updatedAt: 20 },
              ],
              nextCursor: null,
            },
          ],
        },
        isLoading: false,
        hasNextPage: false,
        isFetchingNextPage: false,
        fetchNextPage: vi.fn(),
      })
      .mockReturnValueOnce({
        data: {
          pages: [
            {
              threads: [{ id: "brief", title: "Morning brief", updatedAt: 30 }],
              nextCursor: null,
            },
          ],
        },
        isLoading: false,
        hasNextPage: false,
        isFetchingNextPage: false,
        fetchNextPage: vi.fn(),
      });

    const html = renderToStaticMarkup(
      createElement(ThreadHistory, {
        currentId: "active-thread",
        onPick: vi.fn(),
      }),
    );

    expect(html).toContain("Morning brief");
    expect(html).toContain("Plan the launch");
    expect(html.indexOf("Morning brief")).toBeLessThan(
      html.indexOf("Plan the launch"),
    );
    expect(html).not.toContain("Conversations");
    expect(html).not.toContain("Briefs");
  });

  it("only renders a session search field when the Remix sidebar requests it", () => {
    const query = {
      data: { pages: [{ threads: [], nextCursor: null }] },
      isLoading: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
    };
    useInfiniteQuery.mockReturnValueOnce(query).mockReturnValueOnce(query);

    const html = renderToStaticMarkup(
      createElement(ThreadHistory, {
        currentId: "active-thread",
        onPick: vi.fn(),
        showSearch: true,
      }),
    );

    expect(html).toContain('placeholder="Search sessions"');
  });

  it("uses a grouped session-list skeleton while both histories load", () => {
    const query = {
      data: undefined,
      isLoading: true,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
    };
    useInfiniteQuery.mockReturnValueOnce(query).mockReturnValueOnce(query);

    const html = renderToStaticMarkup(
      createElement(ThreadHistory, {
        currentId: "active-thread",
        onPick: vi.fn(),
        showSearch: true,
      }),
    );

    expect(html).toContain('aria-label="Loading sessions"');
    expect(html).toContain("tavern-session-skeleton");
    expect(html).toContain("tavern-session-skeleton-group");
    expect(html).toContain("tavern-thread-divider");
    expect(html).toContain("tavern-session-skeleton-row is-wide is-current");
    expect(html).not.toContain("Loading sessions…");
  });

  it("shows local display names and compact session actions only when requested", () => {
    const query = {
      data: {
        pages: [
          {
            threads: [{ id: "session", title: "Original name", updatedAt: 30 }],
            nextCursor: null,
          },
        ],
      },
      isLoading: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
    };
    useInfiniteQuery.mockReturnValueOnce(query).mockReturnValueOnce({
      ...query,
      data: { pages: [{ threads: [], nextCursor: null }] },
    });

    const html = renderToStaticMarkup(
      createElement(ThreadHistory, {
        currentId: "active-thread",
        onPick: vi.fn(),
        titleOverrides: { session: "Launch plan" },
        onRename: vi.fn().mockResolvedValue(undefined),
        onDelete: vi.fn().mockResolvedValue(undefined),
      }),
    );

    expect(html).toContain("Launch plan");
    expect(html).not.toContain("Original name");
    expect(html).toContain("Session actions for Launch plan");
  });

  it("offers the same rename and delete actions from a clean right-click row", () => {
    const query = {
      data: {
        pages: [
          {
            threads: [{ id: "session", title: "Launch plan", updatedAt: 30 }],
            nextCursor: null,
          },
        ],
      },
      isLoading: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
    };
    useInfiniteQuery.mockReturnValueOnce(query).mockReturnValueOnce({
      ...query,
      data: { pages: [{ threads: [], nextCursor: null }] },
    });

    const html = renderToStaticMarkup(
      createElement(ThreadHistory, {
        currentId: "active-thread",
        onPick: vi.fn(),
        onRename: vi.fn().mockResolvedValue(undefined),
        onDelete: vi.fn().mockResolvedValue(undefined),
        sessionActions: "context",
      }),
    );

    expect(html).toContain('data-slot="context-menu-trigger"');
    expect(html).not.toContain('data-slot="dropdown-menu-trigger"');
  });
});
