import { describe, expect, it } from "vitest";
import {
  parsePluginPages,
  parsePluginSettingsFields,
  pluginSlug,
} from "./ui.js";

describe("pluginSlug", () => {
  it("makes scoped package names URL/route-safe with a stable hash suffix", () => {
    expect(pluginSlug("@freestyle-voice/plugin-audio-transcription")).toMatch(
      /^freestyle-voice-plugin-audio-transcription-[a-z0-9]+$/,
    );
  });

  it("is deterministic for the same name", () => {
    expect(pluginSlug("@acme/foo")).toBe(pluginSlug("@acme/foo"));
  });

  it("round-trips through a URL host (no @ or /)", () => {
    const slug = pluginSlug("@acme/My_Plugin");
    const url = new URL(`freestyle-plugin://${slug}/ui/index.html`);
    expect(url.hostname).toBe(slug);
    expect(slug).toMatch(/^[a-z0-9-]+$/);
  });

  it("trims and collapses unsafe characters into the base", () => {
    expect(pluginSlug("@scope/--weird..name--")).toMatch(
      /^scope-weird-name-[a-z0-9]+$/,
    );
  });

  it("gives lossy-collision-prone names distinct slugs", () => {
    // These all sanitize to the same base ("a-b") — the hash must keep them
    // distinct so they can't share a session partition or storage namespace.
    const slugs = new Set([
      pluginSlug("@a/b"),
      pluginSlug("a-b"),
      pluginSlug("a.b"),
      pluginSlug("A_B"),
    ]);
    expect(slugs.size).toBe(4);
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

describe("parsePluginSettingsFields", () => {
  it("returns [] for missing/invalid manifests", () => {
    expect(parsePluginSettingsFields(undefined)).toEqual([]);
    expect(parsePluginSettingsFields(null)).toEqual([]);
    expect(parsePluginSettingsFields({})).toEqual([]);
    expect(parsePluginSettingsFields({ contributes: {} })).toEqual([]);
    expect(
      parsePluginSettingsFields({ contributes: { settings: "nope" } }),
    ).toEqual([]);
  });

  it("parses each field type", () => {
    const fields = parsePluginSettingsFields({
      contributes: {
        settings: [
          { key: "prefix", type: "string", label: "Prefix", default: "hi" },
          { key: "count", type: "number", label: "Count" },
          { key: "enabled", type: "boolean", label: "Enabled", default: true },
          {
            key: "mode",
            type: "select",
            label: "Mode",
            options: [
              { value: "a", label: "A" },
              { value: "b", label: "B" },
            ],
            default: "a",
          },
        ],
      },
    });
    expect(fields).toEqual([
      { key: "prefix", type: "string", label: "Prefix", default: "hi" },
      { key: "count", type: "number", label: "Count" },
      { key: "enabled", type: "boolean", label: "Enabled", default: true },
      {
        key: "mode",
        type: "select",
        label: "Mode",
        options: [
          { value: "a", label: "A" },
          { value: "b", label: "B" },
        ],
        default: "a",
      },
    ]);
  });

  it("drops invalid fields and de-dupes keys", () => {
    const fields = parsePluginSettingsFields({
      contributes: {
        settings: [
          { key: "a", type: "string", label: "A" },
          { key: "a", type: "string", label: "Dup" },
          { key: "", type: "string", label: "no key" },
          { key: "b", type: "bogus", label: "Bad type" },
          { key: "c", type: "select", label: "No options" },
          { key: "d", type: "select", label: "Empty options", options: [] },
          "not an object",
        ],
      },
    });
    expect(fields.map((f) => f.key)).toEqual(["a"]);
  });
});
