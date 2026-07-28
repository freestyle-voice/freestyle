import { describe, expect, it } from "vitest";
import {
  parsePillPanel,
  parsePluginPages,
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

describe("parsePillPanel", () => {
  it("returns undefined for missing/invalid manifests", () => {
    expect(parsePillPanel(undefined)).toBeUndefined();
    expect(parsePillPanel(null)).toBeUndefined();
    expect(parsePillPanel({})).toBeUndefined();
    expect(parsePillPanel({ contributes: {} })).toBeUndefined();
    expect(parsePillPanel({ contributes: { pill: "nope" } })).toBeUndefined();
  });

  it("parses a valid pill panel with explicit dimensions", () => {
    expect(
      parsePillPanel({
        contributes: {
          pill: {
            id: "panel",
            title: "Panel",
            entry: "dist/pill/index.html",
            expand: { width: 380, height: 480 },
          },
        },
      }),
    ).toEqual({
      id: "panel",
      title: "Panel",
      entry: "dist/pill/index.html",
      expand: { width: 380, height: 480 },
    });
  });

  it("drops panels missing required fields", () => {
    const base = { entry: "x", expand: { width: 300, height: 300 } };
    expect(
      parsePillPanel({ contributes: { pill: { ...base, title: "T" } } }),
    ).toBeUndefined();
    expect(
      parsePillPanel({ contributes: { pill: { ...base, id: "a" } } }),
    ).toBeUndefined();
    expect(
      parsePillPanel({
        contributes: { pill: { id: "a", title: "T" } },
      }),
    ).toBeUndefined();
  });

  it("defaults and clamps expand dimensions", () => {
    // Missing expand → defaults.
    expect(
      parsePillPanel({
        contributes: { pill: { id: "a", title: "T", entry: "x" } },
      })?.expand,
    ).toEqual({ width: 400, height: 500 });

    // Below the 200px minimum → clamped.
    expect(
      parsePillPanel({
        contributes: {
          pill: {
            id: "a",
            title: "T",
            entry: "x",
            expand: { width: 10, height: 10 },
          },
        },
      })?.expand,
    ).toEqual({ width: 200, height: 200 });
  });
});
