import { describe, expect, it } from "vitest";
import { parseCompanionStatus } from "../shared/companion";

describe("companion status", () => {
  it("accepts only a bounded Remix label for the passive companion display", () => {
    expect(
      parseCompanionStatus({
        source: "remix",
        label: "  Searching\n the web  ",
      }),
    ).toEqual({ source: "remix", label: "Searching the web" });
    expect(
      parseCompanionStatus({ source: "dictation", label: "Listening" }),
    ).toBeNull();
    expect(parseCompanionStatus({ source: "remix", label: "   " })).toBeNull();
  });

  it("limits externally supplied status text before it reaches an overlay", () => {
    expect(
      parseCompanionStatus({ source: "remix", label: "x".repeat(200) }),
    ).toEqual({ source: "remix", label: "x".repeat(160) });
  });
});
