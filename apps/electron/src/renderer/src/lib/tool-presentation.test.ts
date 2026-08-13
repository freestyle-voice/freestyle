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
