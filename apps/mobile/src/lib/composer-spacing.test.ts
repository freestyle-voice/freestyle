import { describe, expect, it } from "vitest";

import { composerBottomPadding } from "./composer-spacing";

describe("composerBottomPadding", () => {
  it("uses only a compact breathing room while the keyboard is visible", () => {
    expect(
      composerBottomPadding({ keyboardVisible: true, bottomInset: 34 }),
    ).toBe(8);
  });

  it("restores the home-indicator clearance after the keyboard closes", () => {
    expect(
      composerBottomPadding({ keyboardVisible: false, bottomInset: 34 }),
    ).toBe(50);
  });
});
