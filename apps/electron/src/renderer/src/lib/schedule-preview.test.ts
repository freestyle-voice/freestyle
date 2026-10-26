import { describe, expect, it } from "vitest";
import { schedulePreview } from "./schedule-preview";

describe("schedule timing previews", () => {
  const now = new Date("2026-10-26T00:00:00Z");
  it("does not invent an exact time for an interpreted schedule", () => {
    expect(schedulePreview(null, "Asia/Kolkata", now)).toEqual({
      kind: "interpreted",
    });
  });
  it("calculates weekdays in the selected timezone", () => {
    expect(schedulePreview("0 8 * * 1-5", "Asia/Kolkata", now)).toEqual({
      kind: "cron",
      next: "2026-10-26T02:30:00.000Z",
    });
  });
  it("handles daylight-saving offset changes", () => {
    expect(
      schedulePreview(
        "0 8 * * *",
        "America/New_York",
        new Date("2026-11-01T00:00:00Z"),
      ),
    ).toEqual({ kind: "cron", next: "2026-11-01T13:00:00.000Z" });
  });
  it("skips the repeated autumn hour once its first occurrence has passed", () => {
    expect(
      schedulePreview(
        "30 1 * * *",
        "America/New_York",
        new Date("2026-11-01T06:00:00Z"),
      ),
    ).toEqual({ kind: "cron", next: "2026-11-02T06:30:00.000Z" });
  });
  it("skips all frequent candidates within a repeated hour", () => {
    expect(
      schedulePreview(
        "*/5 * * * *",
        "America/New_York",
        new Date("2026-11-01T06:00:00Z"),
      ),
    ).toEqual({ kind: "cron", next: "2026-11-01T07:00:00.000Z" });
  });
  it("skips nonexistent spring wall times instead of shifting them", () => {
    expect(
      schedulePreview(
        "30 2 * * *",
        "America/New_York",
        new Date("2026-03-08T00:00:00Z"),
      ),
    ).toEqual({ kind: "cron", next: "2026-03-09T06:30:00.000Z" });
  });
  it("normalizes Sunday before applying weekday steps like Cloud", () => {
    expect(
      schedulePreview("0 8 * * 7/2", "UTC", new Date("2026-10-26T00:00:00Z")),
    ).toEqual({ kind: "cron", next: "2026-10-27T08:00:00.000Z" });
    expect(schedulePreview("0 8 * * 1-7", "UTC", now).kind).toBe("error");
    expect(schedulePreview("0 8 * * 07/2", "UTC", now)).toEqual({
      kind: "cron",
      next: "2026-10-27T08:00:00.000Z",
    });
    expect(schedulePreview("0 8 * * 1-07", "UTC", now).kind).toBe("error");
  });
  it.each([
    "bad cron",
    "0 0 8 * * *",
    "@daily",
    "0 8 L * *",
    "*/2 * * * *",
    "0,3 * * * *",
  ])("rejects unsupported or too-frequent cron: %s", (cron) => {
    expect(schedulePreview(cron, "UTC", now).kind).toBe("error");
  });
  it("rejects invalid timezones before saving either timing mode", () => {
    expect(schedulePreview(null, "Mars/Olympus", now).kind).toBe("error");
    expect(schedulePreview("0 8 * * *", "", now).kind).toBe("error");
  });
});
