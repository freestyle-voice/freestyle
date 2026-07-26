import { describe, expect, it } from "vitest";
import {
  sonioxContextFromBias,
  sonioxGeneralFromAppContext,
} from "../src/lib/streaming/transcribe-bias.js";

describe("sonioxContextFromBias", () => {
  it("forwards terms and text", () => {
    expect(
      sonioxContextFromBias({
        kind: "soniox-context",
        terms: ["Freestyle"],
        text: "Freestyle: our dictation app",
      }),
    ).toEqual({
      terms: ["Freestyle"],
      text: "Freestyle: our dictation app",
    });
  });

  it("returns undefined for non-soniox bias kinds", () => {
    expect(
      sonioxContextFromBias({ kind: "prompt", text: "Terms: Freestyle." }),
    ).toBeUndefined();
    expect(sonioxContextFromBias(null)).toBeUndefined();
  });
});

describe("sonioxGeneralFromAppContext", () => {
  it("builds entries from a JSON app-context payload", () => {
    const general = sonioxGeneralFromAppContext(
      JSON.stringify({
        app: "Slack",
        windowTitle: "#engineering — Freestyle",
        url: "https://app.slack.com/client",
      }),
    );
    expect(general).toEqual([
      { key: "application", value: "Slack" },
      { key: "window title", value: "#engineering — Freestyle" },
      { key: "url", value: "https://app.slack.com/client" },
    ]);
  });

  it("treats a bare string as the application name", () => {
    expect(sonioxGeneralFromAppContext("Notes")).toEqual([
      { key: "application", value: "Notes" },
    ]);
  });

  it("returns undefined for missing or empty context", () => {
    expect(sonioxGeneralFromAppContext(null)).toBeUndefined();
    expect(sonioxGeneralFromAppContext(undefined)).toBeUndefined();
    expect(sonioxGeneralFromAppContext(JSON.stringify({}))).toBeUndefined();
  });

  it("caps entry values at 256 characters", () => {
    const general = sonioxGeneralFromAppContext(
      JSON.stringify({ windowTitle: "x".repeat(400) }),
    );
    expect(general).toHaveLength(1);
    expect(general?.[0].value).toHaveLength(256);
  });
});
