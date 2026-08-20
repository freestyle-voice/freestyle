import { describe, expect, it } from "vitest";

import { resolveVoiceAgentResult } from "./voice-agent";

describe("voice-only keyboard agent results", () => {
  it("holds a direct clarification in the keyboard instead of inserting it", () => {
    expect(resolveVoiceAgentResult("Who should this be addressed to?")).toEqual(
      {
        kind: "question",
        text: "Who should this be addressed to?",
      },
    );
  });

  it("marks a finished response for cursor insertion", () => {
    expect(resolveVoiceAgentResult("Thanks, I will send it today.")).toEqual({
      kind: "insert",
      text: "Thanks, I will send it today.",
    });
  });
});
