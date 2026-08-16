import { describe, expect, it } from "vitest";
import { toolPresentation } from "./tool-presentation";

describe("toolPresentation", () => {
  it("turns an encoded connected-app tool name into human-readable activity", () => {
    expect(
      toolPresentation(
        "tool-connector__gmail__474d41494c5f46455443485f454d41494c53",
      ),
    ).toEqual({
      title: "Used Gmail",
      detail: "Fetch emails",
    });
  });

  it("uses the companion's existing plain-language labels for local tools", () => {
    expect(toolPresentation("tool-web_search")).toEqual({
      title: "Searched the web",
      detail: undefined,
    });
  });
});

describe("tool phases", () => {
  it("uses present tense while a tool is running", () => {
    expect(toolPresentation("tool-web_search", "running").title).toBe(
      "Searching the web",
    );
    expect(toolPresentation("tool-Bash", "running").title).toBe(
      "Running a command",
    );
  });

  it("names the refusal rather than hiding it", () => {
    expect(toolPresentation("tool-paste", "declined").title).toBe(
      "Didn't paste — you declined",
    );
    expect(toolPresentation("tool-Bash", "failed").title).toContain(
      "didn't work",
    );
  });

  it("carries the phase through connector tools", () => {
    expect(
      toolPresentation("tool-connector__gmail__ro_list", "running").title,
    ).toBe("Using Gmail");
    expect(
      toolPresentation("tool-connector__gmail__send", "declined").title,
    ).toBe("Didn't use Gmail — you declined");
  });

  it("falls back for an unmapped tool", () => {
    expect(toolPresentation("tool-some_new_thing", "running").title).toBe(
      "Some new thing",
    );
  });
});
