import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const { useQuery } = vi.hoisted(() => ({ useQuery: vi.fn() }));

vi.mock("@tanstack/react-query", () => ({ useQuery }));
vi.mock("@renderer/lib/auth-context", () => ({
  useCloudAuth: () => ({ loading: false, user: { id: "user-1" } }),
}));

import { AttentionHome } from "./attention-home";

const item = (index: number) => ({
  id: `turn:${index}`,
  kind: "agent_run" as const,
  priority: "informational" as const,
  status: "running" as const,
  title: `Working on ${index}`,
  createdAt: "2026-09-01T11:00:00.000Z",
  updatedAt: "2026-09-01T11:00:00.000Z",
  target: { type: "thread" as const, threadId: `thread-${index}` },
});

describe("AttentionHome", () => {
  it("does not interrupt the new-chat welcome while attention loads", () => {
    useQuery.mockReturnValue({ isPending: true });

    const html = renderToStaticMarkup(createElement(AttentionHome));

    expect(html).toBe("");
  });

  it("keeps the surface compact while preserving the total count", () => {
    useQuery.mockReturnValue({
      isPending: false,
      data: {
        generatedAt: "2026-09-01T12:00:00.000Z",
        items: Array.from({ length: 6 }, (_, index) => item(index + 1)),
      },
    });

    const html = renderToStaticMarkup(createElement(AttentionHome));

    expect(html).toContain("Working on 5");
    expect(html).toContain("Working on 6");
    expect(html).toContain("View 1 more item");
    expect(html).toContain("<details");
    expect(html).toContain('class="tavern-attention-count">6');
  });
  it("offers a retry when the initial attention read fails", () => {
    useQuery.mockReturnValue({
      isError: true,
      isPending: false,
      refetch: vi.fn(),
    });
    const html = renderToStaticMarkup(createElement(AttentionHome));
    expect(html).toContain("Couldn&#x27;t refresh work that needs attention.");
    expect(html).toContain("Try again");
  });

  it("keeps stale work visible when refreshing fails", () => {
    useQuery.mockReturnValue({
      isError: true,
      isPending: false,
      data: { items: [item(1)] },
      refetch: vi.fn(),
    });
    const html = renderToStaticMarkup(createElement(AttentionHome));
    expect(html).toContain("Working on 1");
    expect(html).toContain("Try again");
  });

  it("makes connection and scheduled targets actionable without a thread", () => {
    useQuery.mockReturnValue({
      isPending: false,
      data: {
        items: [
          {
            ...item(1),
            target: { type: "connection", connectionId: "connection-1" },
          },
          {
            ...item(2),
            target: { type: "scheduled", taskId: "task-1", runId: "run-1" },
          },
        ],
      },
    });
    const html = renderToStaticMarkup(
      createElement(AttentionHome, {
        onOpenSettings: vi.fn(),
        onOpenScheduled: vi.fn(),
      }),
    );
    expect(html.match(/class="tavern-attention-item"/g)).toHaveLength(2);
    expect(html).not.toContain("is-static");
  });
});
