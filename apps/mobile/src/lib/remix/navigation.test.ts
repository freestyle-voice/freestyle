import { describe, expect, it } from "vitest";

import { MOBILE_TABS } from "./navigation";

describe("mobile navigation", () => {
  it("exposes only the Home, Activity, and Profile destinations", () => {
    expect(MOBILE_TABS).toEqual([
      { name: "index", label: "Home" },
      { name: "activity", label: "Activity" },
      { name: "account", label: "Profile" },
    ]);
  });
});
