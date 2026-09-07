import { describe, expect, it } from "vitest";

import {
  isSidebarVisibility,
  SIDEBAR_VISIBILITY_STORAGE_KEY,
} from "./sidebar-visibility";

describe("sidebar visibility preference", () => {
  it("only restores a saved visible or hidden preference", () => {
    expect(SIDEBAR_VISIBILITY_STORAGE_KEY).toBe("shell.sidebarVisibility");
    expect(isSidebarVisibility("visible")).toBe(true);
    expect(isSidebarVisibility("hidden")).toBe(true);
    expect(isSidebarVisibility("")).toBe(false);
    expect(isSidebarVisibility("collapsed")).toBe(false);
  });
});
