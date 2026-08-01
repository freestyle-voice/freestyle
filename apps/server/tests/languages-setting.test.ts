import { afterEach, describe, expect, it } from "vitest";
import { deleteSetting, writeSetting } from "../src/lib/db.js";
import {
  getLanguagesSetting,
  getTranslateModeSetting,
} from "../src/lib/language.js";

function clearLanguageSettings(): void {
  deleteSetting("languages");
  deleteSetting("language");
  deleteSetting("translate_mode");
}

afterEach(clearLanguageSettings);

describe("getLanguagesSetting", () => {
  it("returns an empty list (auto-detect) when nothing is set", () => {
    expect(getLanguagesSetting()).toEqual([]);
  });

  it("parses the canonical `languages` JSON array", () => {
    writeSetting("languages", JSON.stringify(["en", "es"]));
    expect(getLanguagesSetting()).toEqual(["en", "es"]);
  });

  it("normalizes (lowercase, dedupe, drop auto, cap 5) on read", () => {
    writeSetting(
      "languages",
      JSON.stringify(["EN", "en", "auto", "fr", "de", "it", "pt", "nl"]),
    );
    expect(getLanguagesSetting()).toEqual(["en", "fr", "de", "it", "pt"]);
  });

  it("treats an explicit empty array as auto-detect (authoritative)", () => {
    // A legacy value exists, but the newer `languages` key wins even when empty.
    writeSetting("language", "es");
    writeSetting("languages", JSON.stringify([]));
    expect(getLanguagesSetting()).toEqual([]);
  });

  it("treats a present-but-empty-string row as authoritative auto-detect", () => {
    // The cloud pull writes "" for a null cloud value; it must not resurrect a
    // stale legacy choice.
    writeSetting("language", "es");
    writeSetting("languages", "");
    expect(getLanguagesSetting()).toEqual([]);
  });

  it("tolerates a stray scalar stored under the array key as one code", () => {
    writeSetting("languages", "fr");
    expect(getLanguagesSetting()).toEqual(["fr"]);
  });

  it("falls back to the legacy singular `language` key when unmigrated", () => {
    writeSetting("language", "fr");
    expect(getLanguagesSetting()).toEqual(["fr"]);
  });

  it("ignores a legacy `auto` value on fallback", () => {
    writeSetting("language", "auto");
    expect(getLanguagesSetting()).toEqual([]);
  });
});

describe("getTranslateModeSetting", () => {
  it("is off with zero languages", () => {
    writeSetting("translate_mode", "true");
    expect(getTranslateModeSetting()).toBe(false);
  });

  it("is off with multiple languages", () => {
    writeSetting("languages", JSON.stringify(["en", "es"]));
    writeSetting("translate_mode", "true");
    expect(getTranslateModeSetting()).toBe(false);
  });

  it("respects the flag with exactly one language", () => {
    writeSetting("languages", JSON.stringify(["es"]));
    writeSetting("translate_mode", "true");
    expect(getTranslateModeSetting()).toBe(true);

    writeSetting("translate_mode", "false");
    expect(getTranslateModeSetting()).toBe(false);
  });
});
