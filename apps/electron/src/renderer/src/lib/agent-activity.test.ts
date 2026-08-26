import { describe, expect, it } from "vitest";
import { agentWorkDuration, toolActivityParts } from "./agent-activity";

describe("toolActivityParts", () => {
  it("collects every ordinary tool run in one assistant-message activity", () => {
    const parts = [
      { type: "tool-web_search" },
      { type: "text", text: "I found the answer." },
      { type: "tool-current_time" },
      { type: "tool-suggest_connections" },
      { type: "tool-get_context" },
    ];

    expect(toolActivityParts(parts)).toEqual([
      { type: "tool-web_search" },
      { type: "tool-current_time" },
      { type: "tool-get_context" },
    ]);
  });

  it("uses only a complete pair of persisted turn timestamps", () => {
    expect(
      agentWorkDuration({
        agentTurnStartedAt: 1_000,
        agentTurnCompletedAt: 114_000,
      }),
    ).toBe(113_000);
    expect(agentWorkDuration({ agentTurnStartedAt: 1_000 })).toBeNull();
  });
});
