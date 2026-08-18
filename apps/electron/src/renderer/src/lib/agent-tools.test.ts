import { describe, expect, it, vi } from "vitest";

vi.mock("@shared/sprite-events", () => ({
  parseSpriteEmotion: vi.fn(),
}));

import { agentToolTier } from "./agent-tools";

describe("agent tool approval tiers", () => {
  const call = (toolName: string) => ({
    toolName,
    toolCallId: "call-1",
    input: {},
  });

  it("runs read-only local tools without asking", async () => {
    await expect(agentToolTier(call("Read"))).resolves.toBe("free");
    await expect(agentToolTier(call("Glob"))).resolves.toBe("free");
    await expect(agentToolTier(call("Grep"))).resolves.toBe("free");
  });

  it("runs mutating local tools without asking too", async () => {
    await expect(agentToolTier(call("Write"))).resolves.toBe("free");
    await expect(agentToolTier(call("Edit"))).resolves.toBe("free");
    await expect(
      agentToolTier({ ...call("Bash"), input: { command: "rm -rf ./x" } }),
    ).resolves.toBe("free");
  });

  it("does not claim connected-app tools, which run on the server", async () => {
    await expect(
      agentToolTier(call("connector__gmail__474d41494c5f53454")),
    ).resolves.toBeNull();
  });
});
