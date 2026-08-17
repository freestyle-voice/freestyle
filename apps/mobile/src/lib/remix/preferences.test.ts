import { describe, expect, it } from "vitest";

import { DEFAULT_AUTO_LISTEN_AFTER_REMIX_QUESTION } from "./preferences";

describe("Remix keyboard preferences", () => {
  it("returns to listening after a clarification by default", () => {
    expect(DEFAULT_AUTO_LISTEN_AFTER_REMIX_QUESTION).toBe(true);
  });
});
