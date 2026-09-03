import { describe, expect, it } from "vitest";
import { AgentMessageQueue } from "../src/lib/agent-message-queue.js";

describe("AgentMessageQueue", () => {
  it("keeps follow-ups ordered, editable, and retryable until Cloud accepts one", async () => {
    const queue = new AgentMessageQueue();
    const first = queue.enqueue("thread-1", { text: "First follow-up" });
    const second = queue.enqueue("thread-1", { text: "Second follow-up" });

    expect(queue.update("thread-1", second.id, "Edited follow-up")?.text).toBe(
      "Edited follow-up",
    );

    await expect(
      queue.drain("thread-1", async () => {
        throw new Error("cloud unavailable");
      }),
    ).rejects.toThrow("cloud unavailable");
    expect(queue.list("thread-1").map((item) => item.id)).toEqual([
      first.id,
      second.id,
    ]);

    const sent: string[] = [];
    await queue.drain("thread-1", async (item) => sent.push(item.text));
    expect(sent).toEqual(["First follow-up"]);
    expect(queue.list("thread-1")).toEqual([
      expect.objectContaining({ id: second.id, text: "Edited follow-up" }),
    ]);
  });

  it("prioritizes a steered message without duplicating it", () => {
    const queue = new AgentMessageQueue();
    const first = queue.enqueue("thread-1", { text: "First" });
    const second = queue.enqueue("thread-1", { text: "Steer this" });

    expect(queue.prioritize("thread-1", second.id)).toMatchObject({
      id: second.id,
    });
    expect(queue.list("thread-1").map((item) => item.id)).toEqual([
      second.id,
      first.id,
    ]);
    expect(queue.remove("thread-1", second.id)).toMatchObject({
      text: "Steer this",
    });
    expect(queue.list("thread-1")).toHaveLength(1);
  });
});
