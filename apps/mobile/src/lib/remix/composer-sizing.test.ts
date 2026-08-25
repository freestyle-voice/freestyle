import { describe, expect, it } from "vitest";

import {
  REMIX_COMPOSER_MAX_INPUT_HEIGHT,
  REMIX_COMPOSER_MIN_INPUT_HEIGHT,
  remixComposerInputHeight,
} from "./composer-sizing";

describe("Remix composer sizing", () => {
  it("keeps a compact one-line minimum", () => {
    expect(remixComposerInputHeight(0)).toBe(REMIX_COMPOSER_MIN_INPUT_HEIGHT);
  });

  it("grows with the native text content until the four-line cap", () => {
    expect(remixComposerInputHeight(71.2)).toBe(72);
    expect(remixComposerInputHeight(320)).toBe(REMIX_COMPOSER_MAX_INPUT_HEIGHT);
  });

  it("does not add the input's own vertical padding a second time", () => {
    expect(remixComposerInputHeight(42)).toBe(42);
  });
});
