import { describe, expect, it } from "vitest";
import { parseSaved } from "./onboarding-core";

describe("parseSaved", () => {
  it("round-trips a valid v2 state", () => {
    const state = {
      v: 2,
      done: false,
      beat: "goal",
      name: "Matt",
      task: "",
      connected: ["gmail"],
      automations: ["morning-inbox-brief"],
    };
    expect(parseSaved(JSON.stringify(state))).toEqual(state);
  });

  it("drops an unknown saved beat so the flow restarts cleanly", () => {
    const state = { v: 2, done: false, beat: "blade" };
    expect(parseSaved(JSON.stringify(state))?.beat).toBeUndefined();
  });

  it("migrates a completed v1 save and restarts a mid-flow one", () => {
    expect(
      parseSaved(JSON.stringify({ v: 1, done: true, task: "old task" })),
    ).toEqual({ v: 2, done: true, task: "old task" });
    expect(
      parseSaved(JSON.stringify({ v: 1, done: false, beat: "job" })),
    ).toBeNull();
  });

  it("rejects garbage, wrong versions, and empty values", () => {
    expect(parseSaved(undefined)).toBeNull();
    expect(parseSaved("")).toBeNull();
    expect(parseSaved("not json")).toBeNull();
    expect(parseSaved(JSON.stringify({ v: 3, done: true }))).toBeNull();
  });
});
