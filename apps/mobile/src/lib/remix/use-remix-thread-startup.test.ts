import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const hook = readFileSync(
  new URL("./use-remix-thread.ts", import.meta.url),
  "utf8",
);

describe("Remix home startup", () => {
  it("starts with an unsaved thread instead of reopening the most recent chat", () => {
    expect(hook).toContain('const initialThreadId = useRef(newId("thread"));');
    expect(hook).not.toContain("getLatestThread");
    expect(hook).not.toContain("latestThreadState");
  });

  it("marks only the first accepted message as the thread-creating turn", () => {
    expect(hook).toContain("firstTurn: nextMessages.length === 1");
  });

  it("sends a durable cancellation instead of only stopping local observation", () => {
    expect(hook).toContain('commandDurableTurn(turnId, { type: "cancel" })');
    expect(hook).toContain("couldn't cancel Remix on the server");
  });
});
