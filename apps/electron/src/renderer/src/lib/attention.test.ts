import { describe, expect, it, vi } from "vitest";

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));

vi.mock("@renderer/lib/api", () => ({ apiFetch }));

import { getAttention } from "./attention";

describe("attention client", () => {
  it("keeps only the safe, display-ready fields from the Cloud snapshot", async () => {
    apiFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          generatedAt: "2026-09-01T12:00:00.000Z",
          items: [
            {
              id: "action:1",
              kind: "approval",
              priority: "requires_action",
              status: "waiting",
              title: "Approve command",
              createdAt: "2026-09-01T11:00:00.000Z",
              updatedAt: "2026-09-01T11:30:00.000Z",
              target: {
                type: "thread",
                threadId: "thread-1",
                turnId: "turn-1",
              },
              toolInput: { command: "should-not-be-read" },
            },
          ],
        }),
      ),
    );

    await expect(getAttention()).resolves.toEqual({
      generatedAt: "2026-09-01T12:00:00.000Z",
      items: [
        {
          id: "action:1",
          kind: "approval",
          priority: "requires_action",
          status: "waiting",
          title: "Approve command",
          createdAt: "2026-09-01T11:00:00.000Z",
          updatedAt: "2026-09-01T11:30:00.000Z",
          target: { type: "thread", threadId: "thread-1", turnId: "turn-1" },
        },
      ],
    });
    expect(apiFetch).toHaveBeenCalledWith("/api/attention");
  });

  it("treats an older Cloud deployment as an empty, non-blocking state", async () => {
    apiFetch.mockResolvedValue(new Response(null, { status: 404 }));

    await expect(getAttention()).resolves.toEqual(
      expect.objectContaining({ items: [] }),
    );
  });
});
