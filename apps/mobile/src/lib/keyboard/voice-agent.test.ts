import { describe, expect, it } from "vitest";

import { resolveVoiceAgentResult } from "./voice-agent";

describe("voice-only keyboard agent results", () => {
  it("does not turn an empty terminal response into a blank insertion", () => {
    expect(resolveVoiceAgentResult("   ")).toBeNull();
  });

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

  it("can paste a finished draft that ends with a question mark", () => {
    expect(
      resolveVoiceAgentResult("FINAL: Could you send that by Friday?"),
    ).toEqual({
      kind: "insert",
      text: "Could you send that by Friday?",
    });
  });

  it("keeps an explicitly tagged clarification in the keyboard", () => {
    expect(
      resolveVoiceAgentResult("CLARIFY: Who should this be addressed to?"),
    ).toEqual({
      kind: "question",
      text: "Who should this be addressed to?",
    });
  });
});
