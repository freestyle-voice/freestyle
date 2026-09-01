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
  it("uses a shape-matched skeleton only for the first empty cache", () => {
    useQuery.mockReturnValue({ isPending: true });

    const html = renderToStaticMarkup(createElement(AttentionHome));

    expect(html).toContain('aria-label="Loading work that needs attention"');
    expect(html).not.toContain("Loading…");
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
    expect(html).not.toContain("Working on 6");
    expect(html).toContain('class="tavern-attention-count">6');
  });
});
