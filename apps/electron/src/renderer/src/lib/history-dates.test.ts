import { afterEach, describe, expect, it, vi } from "vitest";
import { getLocalDateString, getRecentDateRange } from "./history-dates";

afterEach(() => vi.unstubAllEnvs());

describe("history quick date ranges", () => {
  it.each([
    [1, "2026-10-09"],
    [3, "2026-10-07"],
    [7, "2026-10-03"],
    [30, "2026-09-10"],
  ] as const)("includes today in a %i-day range", (days, start) => {
    const now = new Date(2026, 9, 9, 23, 45);
    const range = getRecentDateRange(days, now);
    expect(getLocalDateString(range.from)).toBe(start);
    expect(getLocalDateString(range.to)).toBe("2026-10-09");
    expect(range.to.getHours()).toBe(0);
    expect(now.getHours()).toBe(23);
  });

  it("crosses year and leap-month boundaries", () => {
    expect(
      getLocalDateString(getRecentDateRange(3, new Date(2027, 0, 1)).from),
    ).toBe("2026-12-30");
    expect(
      getLocalDateString(getRecentDateRange(3, new Date(2028, 2, 1)).from),
    ).toBe("2028-02-28");
  });

  it("uses local calendar days across daylight saving time", () => {
    vi.stubEnv("TZ", "America/New_York");
    const { from, to } = getRecentDateRange(3, new Date(2026, 2, 9));
    expect(getLocalDateString(from)).toBe("2026-03-07");
    expect(getLocalDateString(to)).toBe("2026-03-09");
    expect(from.getHours()).toBe(0);
    expect(to.getHours()).toBe(0);
    expect(to.getTime() - from.getTime()).toBe(47 * 60 * 60 * 1000);
  });
});
