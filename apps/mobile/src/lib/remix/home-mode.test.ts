import { describe, expect, it } from "vitest";

import { DEFAULT_HOME_MODE } from "./home-mode";

describe("home mode", () => {
  it("opens the assistant-first experience in Remix mode", () => {
    expect(DEFAULT_HOME_MODE).toBe("remix");
  });
});
