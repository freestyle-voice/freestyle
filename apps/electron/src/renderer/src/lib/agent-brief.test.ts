import { describe, expect, it } from "vitest";
import { readAgentBrief } from "./agent-brief";

describe("readAgentBrief", () => {
  it("reads the cloud's compact display object and ignores malformed parts", () => {
    expect(
      readAgentBrief([
        { type: "text", text: "Full persisted answer" },
        {
          type: "data-brief",
          data: {
            headline: "Rain starts at 3 PM.",
            summary: "Bring an umbrella.",
            points: ["Carry a compact umbrella"],
          },
        },
      ]),
    ).toEqual({
      headline: "Rain starts at 3 PM.",
      summary: "Bring an umbrella.",
      points: ["Carry a compact umbrella"],
    });
    expect(
      readAgentBrief([{ type: "data-brief", data: { headline: 3 } }]),
    ).toBeNull();
  });
});
