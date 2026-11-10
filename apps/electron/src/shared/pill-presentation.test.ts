import { describe, expect, it } from "vitest";
import {
  normalizePillExpansion,
  resolvePillPresentation,
} from "./pill-presentation";

describe("resolvePillPresentation", () => {
  it("keeps the capsule collapsed when no expanded surface owns it", () => {
    expect(resolvePillPresentation({ dictationError: false })).toEqual({
      kind: "collapsed",
      expansion: null,
    });
  });

  it("opens the compact card for a dictation failure", () => {
    expect(resolvePillPresentation({ dictationError: true })).toEqual({
      kind: "card",
      expansion: "card",
    });
  });
});

describe("normalizePillExpansion", () => {
  it("accepts only host-owned expanded surfaces", () => {
    expect(normalizePillExpansion("card")).toBe("card");
    expect(normalizePillExpansion("remix-chat")).toBe("card");
    expect(normalizePillExpansion("plugin-panel")).toBe("card");
    expect(normalizePillExpansion(undefined)).toBe("card");
  });
});
