import { describe, expect, it } from "vitest";

import { appendAssistantDelta, latestThreadState } from "./thread";

describe("Remix thread updates", () => {
  it("extends the current assistant turn instead of adding a message per stream chunk", () => {
    const first = appendAssistantDelta([], "First", "assistant-1");
    const second = appendAssistantDelta(first, " draft", "assistant-1");

    expect(second).toEqual([
      {
        id: "assistant-1",
        role: "assistant",
        parts: [{ type: "text", text: "First draft" }],
      },
    ]);
  });

  it("keeps consecutive assistant turns uniquely keyed", () => {
    const first = appendAssistantDelta([], "First", "assistant-1");
    const second = appendAssistantDelta(
      [
        ...first,
        {
          id: "user-2",
          role: "user",
          parts: [{ type: "text", text: "Again" }],
        },
      ],
      "Second",
      "assistant-2",
    );

    expect(second.map((message) => message.id)).toEqual([
      "assistant-1",
      "user-2",
      "assistant-2",
    ]);
  });

  it("uses the latest durable thread without discarding a fresh-thread fallback", () => {
    expect(
      latestThreadState(
        {
          id: "cloud-thread",
          messages: [{ id: "user", role: "user", parts: [] }],
        },
        "fresh-thread",
      ),
    ).toEqual({
      threadId: "cloud-thread",
      messages: [{ id: "user", role: "user", parts: [] }],
    });
    expect(latestThreadState(null, "fresh-thread")).toEqual({
      threadId: "fresh-thread",
      messages: [],
    });
  });
});
