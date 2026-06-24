import { describe, expect, it } from "vitest";
import { parsePluginPages, pluginSlug } from "./ui.js";

describe("pluginSlug", () => {
  it("makes scoped package names URL/route-safe", () => {
    expect(pluginSlug("@freestyle-voice/plugin-audio-transcription")).toBe(
      "freestyle-voice-plugin-audio-transcription",
    );
  });

  it("round-trips through a URL host (no @ or /)", () => {
    const slug = pluginSlug("@acme/My_Plugin");
    const url = new URL(`freestyle-plugin://${slug}/ui/index.html`);
    expect(url.hostname).toBe(slug);
    expect(slug).toMatch(/^[a-z0-9-]+$/);
  });

  it("trims and collapses unsafe characters", () => {
    expect(pluginSlug("@scope/--weird..name--")).toBe("scope-weird-name");
  });
});

describe("parsePluginPages", () => {
  it("returns [] for missing/invalid manifests", () => {
    expect(parsePluginPages(undefined)).toEqual([]);
    expect(parsePluginPages(null)).toEqual([]);
    expect(parsePluginPages({})).toEqual([]);
    expect(parsePluginPages({ contributes: {} })).toEqual([]);
    expect(parsePluginPages({ contributes: { pages: "nope" } })).toEqual([]);
  });

  it("parses valid pages and keeps optional icon", () => {
    const pages = parsePluginPages({
      contributes: {
        pages: [
          { id: "a", title: "A", entry: "ui/a.html", icon: "FileAudio" },
          { id: "b", title: "B", entry: "ui/b.html" },
        ],
      },
    });
    expect(pages).toEqual([
      { id: "a", title: "A", entry: "ui/a.html", icon: "FileAudio" },
      { id: "b", title: "B", entry: "ui/b.html" },
    ]);
  });

  it("drops entries missing required fields and de-dupes ids", () => {
    const pages = parsePluginPages({
      contributes: {
        pages: [
          { id: "a", title: "A", entry: "ui/a.html" },
          { id: "a", title: "Dup", entry: "ui/dup.html" },
          { id: "", title: "no id", entry: "x" },
          { id: "c", title: "", entry: "x" },
          { id: "d", title: "D" },
          "not an object",
        ],
      },
    });
    expect(pages.map((p) => p.id)).toEqual(["a"]);
  });
});
