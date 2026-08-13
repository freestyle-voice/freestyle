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

  it("runs only explicitly read-only connected-app tools without asking", async () => {
    await expect(
      agentToolTier(
        call("connector__gmail__ro_474d41494c5f46455443485f454d41494c53"),
      ),
    ).resolves.toBe("free");
    await expect(
      agentToolTier(call("connector__gmail__474d41494c5f53454")),
    ).resolves.toBe("confirmed");
  });
});
