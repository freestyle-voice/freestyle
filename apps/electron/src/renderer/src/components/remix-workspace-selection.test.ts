import { describe, expect, it } from "vitest";
import { sidebarCurrentThreadId } from "./remix-session-context";

describe("Remix workspace selection", () => {
  it("clears the chat selection while scheduled work is the active workspace surface", () => {
    expect(sidebarCurrentThreadId("scheduled", "chat-123")).toBe("");
  });

  it("preserves the selected chat when the chat workspace is active", () => {
    expect(sidebarCurrentThreadId("chat", "chat-123")).toBe("chat-123");
  });
});
