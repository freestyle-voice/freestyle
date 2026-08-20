import { describe, expect, it } from "vitest";

import { createMobileRemixContext } from "./request";

describe("mobile Remix request context", () => {
  it("omits unavailable desktop context from the cloud agent request", () => {
    expect(createMobileRemixContext(["en"], 1_700_000_000_000)).toEqual({
      selection: null,
      appName: null,
      windowTitle: null,
      languages: ["en"],
      capturedAt: 1_700_000_000_000,
    });
  });
});
