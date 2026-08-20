import { describe, expect, it } from "vitest";

import { appendAssistantDelta } from "./thread";

describe("Remix thread updates", () => {
  it("extends the current assistant turn instead of adding a message per stream chunk", () => {
    const first = appendAssistantDelta([], "First");
    const second = appendAssistantDelta(first, " draft");

    expect(second).toEqual([
      {
        id: "assistant",
        role: "assistant",
        parts: [{ type: "text", text: "First draft" }],
      },
    ]);
  });
});
