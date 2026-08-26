import { describe, expect, it } from "vitest";

import {
  compactActivitySummary,
  workspaceNavigationMode,
} from "./workspace-navigation";

describe("workspaceNavigationMode", () => {
  it("keeps conversation history in a persistent rail when the panel is wide enough", () => {
    expect(workspaceNavigationMode(720)).toBe("rail");
  });

  it("uses an accessible drawer trigger when the panel is narrow", () => {
    expect(workspaceNavigationMode(480)).toBe("drawer");
  });
});

describe("compactActivitySummary", () => {
  it("summarizes multiple tool events without hiding their individual details", () => {
    expect(
      compactActivitySummary([
        { title: "Searched the web", phase: "done" },
        { title: "Read calendar", phase: "running" },
        { title: "Drafted reply", phase: "done" },
      ]),
    ).toEqual({ label: "3 actions", running: true });
  });

  it("uses a singular, readable label for one completed action", () => {
    expect(
      compactActivitySummary([{ title: "Searched the web", phase: "done" }]),
    ).toEqual({ label: "Searched the web", running: false });
  });

  it("uses the persisted elapsed time as the collapsed work label", () => {
    expect(
      compactActivitySummary(
        [{ title: "Searched the web", phase: "done" }],
        113_000,
      ),
    ).toEqual({ label: "Worked for 1m 53s", running: false });
  });
});
