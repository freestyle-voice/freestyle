import { describe, expect, it } from "vitest";

import { messagesForResend, messagesForRetry } from "./thread";

const messages = [
  {
    id: "u1",
    role: "user" as const,
    parts: [{ type: "text" as const, text: "First" }],
  },
  {
    id: "a1",
    role: "assistant" as const,
    parts: [{ type: "text" as const, text: "Answer" }],
  },
  {
    id: "u2",
    role: "user" as const,
    parts: [{ type: "text" as const, text: "Second" }],
  },
  {
    id: "a2",
    role: "assistant" as const,
    parts: [{ type: "text" as const, text: "Another answer" }],
  },
];

describe("Remix resend history", () => {
  it("retries the latest user turn without retaining a partial answer", () => {
    expect(messagesForRetry(messages)).toEqual(messages.slice(0, 3));
  });

  it("replaces an edited user turn and truncates the discarded tail", () => {
    expect(messagesForResend(messages, "u1", "Rewritten first")).toEqual([
      {
        id: "u1",
        role: "user",
        parts: [{ type: "text", text: "Rewritten first" }],
      },
    ]);
  });

  it("does not resend empty text or assistant messages", () => {
    expect(messagesForResend(messages, "u2", "  ")).toBeNull();
    expect(messagesForResend(messages, "a2", "Nope")).toBeNull();
  });
});
