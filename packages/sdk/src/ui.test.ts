import { describe, expect, it } from "vitest";
import { parsePluginPillPanel as parsePluginPillPanelPublic } from "./index.js";
import {
  parsePluginPages,
  parsePluginPillPanel,
  parsePluginSettingsFields,
  pluginSlug,
} from "./ui.js";

describe("pluginSlug", () => {
  it("makes scoped package names URL/route-safe", () => {
    expect(pluginSlug("@freestyle-voice/plugin-audio-transcription")).toBe(
      "freestyle-voice-plugin-audio-transcription",
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

describe("parsePluginPillPanel", () => {
  it("is available through the public SDK entrypoint", () => {
    expect(parsePluginPillPanelPublic).toBe(parsePluginPillPanel);
  });

  it("parses a single bounded pill companion contribution", () => {
    expect(
      parsePluginPillPanel({
        contributes: {
          pill: {
            id: "handoff",
            title: "Handoff",
            entry: "ui/pill.html",
            expand: { width: 360, height: 260 },
          },
        },
      }),
    ).toEqual({
      id: "handoff",
      title: "Handoff",
      entry: "ui/pill.html",
      expand: { width: 360, height: 260 },
    });
  });

  it("drops malformed, unsafe, and oversized pill companion contributions", () => {
    expect(parsePluginPillPanel(undefined)).toBeUndefined();
    expect(
      parsePluginPillPanel({
        contributes: {
          pill: {
            id: "handoff",
            title: "Handoff",
            entry: "../outside.html",
            expand: { width: 360, height: 260 },
          },
        },
      }),
    ).toBeUndefined();
    expect(
      parsePluginPillPanel({
        contributes: {
          pill: {
            id: "handoff",
            title: "Handoff",
            entry: "ui/pill.html",
            expand: { width: 4_000, height: 260 },
          },
        },
      }),
    ).toBeUndefined();
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
