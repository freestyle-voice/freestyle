import { describe, expect, it } from "vitest";
import {
  normalizePillExpansion,
  resolvePillPresentation,
} from "./pill-presentation";

describe("resolvePillPresentation", () => {
  it("keeps the capsule collapsed when no expanded surface owns it", () => {
    expect(
      resolvePillPresentation({ dictationError: false, remixActive: false }),
    ).toEqual({ kind: "collapsed", expansion: null });
  });

  it("opens the compact card for a dictation failure", () => {
    expect(
      resolvePillPresentation({ dictationError: true, remixActive: false }),
    ).toEqual({ kind: "card", expansion: "card" });
  });

  it("reserves the chat-sized room for any active Remix session", () => {
    expect(
      resolvePillPresentation({ dictationError: false, remixActive: true }),
    ).toEqual({ kind: "remix-chat", expansion: "remix-chat" });
  });

  it("does not let a stale dictation failure shrink an active Remix chat", () => {
    expect(
      resolvePillPresentation({ dictationError: true, remixActive: true }),
    ).toEqual({ kind: "remix-chat", expansion: "remix-chat" });
  });
});

describe("normalizePillExpansion", () => {
  it("accepts only host-owned expanded surfaces", () => {
    expect(normalizePillExpansion("card")).toBe("card");
    expect(normalizePillExpansion("remix-chat")).toBe("remix-chat");
    expect(normalizePillExpansion("plugin-panel")).toBe("card");
    expect(normalizePillExpansion(undefined)).toBe("card");
  });
});
