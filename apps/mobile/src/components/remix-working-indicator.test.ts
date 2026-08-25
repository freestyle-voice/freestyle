import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const component = readFileSync(
  new URL("./remix-working-indicator.tsx", import.meta.url),
  "utf8",
);

describe("Remix working indicator", () => {
  it("uses a reduced-motion-aware shimmer track instead of a spinner chip", () => {
    expect(component).toContain("useReducedMotion");
    expect(component).toContain("withRepeat(withTiming(1");
    expect(component).toContain("styles.shimmerTrack");
    expect(component).not.toContain("ActivityIndicator");
  });
});
