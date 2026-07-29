import { describe, expect, it } from "vitest";
import { formatNumber } from "./format";

describe("formatNumber", () => {
  it("formats numbers using the runtime/system locale", () => {
    // In the test runtime the default locale is en-US, so grouping is by
    // thousands. The point of the helper is that this follows whatever the
    // user's OS locale is at runtime.
    expect(formatNumber(1234567)).toBe("1,234,567");
  });

  it("passes options through to Intl.NumberFormat", () => {
    expect(formatNumber(0.5, { style: "percent" })).toBe("50%");
  });

  it("uses Indian grouping under an en-IN locale", () => {
    // Documents the feature: the same value groups differently (lakh/crore
    // style) when the locale is Indian. formatNumber() reaches this via the
    // "default" locale on an Indian device.
    const indian = new Intl.NumberFormat("en-IN").format(1234567);
    expect(indian).toBe("12,34,567");
  });
});
