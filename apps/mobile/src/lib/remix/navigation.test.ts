import { describe, expect, it } from "vitest";

import { MOBILE_TABS } from "./navigation";

describe("mobile navigation", () => {
  it("keeps the five highest-frequency destinations in the native tab bar", () => {
    expect(MOBILE_TABS).toEqual([
      { name: "index", label: "Home" },
      { name: "activity", label: "Activity" },
      { name: "keyboard", label: "Keyboard" },
      { name: "words", label: "Words" },
      { name: "account", label: "Profile" },
    ]);
  });
});
