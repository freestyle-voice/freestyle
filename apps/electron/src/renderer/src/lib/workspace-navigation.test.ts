import { describe, expect, it } from "vitest";
import { workspaceForAppPath } from "./workspace";
import {
  compactActivitySummary,
  workspaceNavigationMode,
} from "./workspace-navigation";

describe("workspaceForAppPath", () => {
  it("makes the restored app route authoritative over a stale sidebar preference", () => {
    expect(workspaceForAppPath("/remix")).toBe("remix");
    expect(workspaceForAppPath("/today")).toBe("dictate");
    expect(workspaceForAppPath("/vocabulary")).toBe("dictate");
  });

  it("leaves settings and plugin routes on the previously selected workspace", () => {
    expect(workspaceForAppPath("/settings/transcription")).toBeNull();
    expect(workspaceForAppPath("/plugins/example/page")).toBeNull();
  });
});

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
