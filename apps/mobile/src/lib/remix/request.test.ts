import { describe, expect, it } from "vitest";

import { createMobileRemixContext } from "./request";

describe("mobile Remix request context", () => {
  it("identifies the mobile surface without claiming desktop selection access", () => {
    expect(createMobileRemixContext(["en"], 1_700_000_000_000)).toEqual({
      selection: null,
      appName: "Freestyle Mobile",
      windowTitle: null,
      languages: ["en"],
      capturedAt: 1_700_000_000_000,
    });
  });
});
