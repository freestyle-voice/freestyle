import { normalizeLanguageList } from "@freestyle-voice/validations";
import { describe, expect, it } from "vitest";
import { aiSdkProviderOptions } from "../src/lib/streaming/utils.js";

describe("normalizeLanguageList", () => {
  it("passes ISO codes through (lowercased, trimmed)", () => {
    expect(normalizeLanguageList(["en", "UK"])).toEqual(["en", "uk"]);
    expect(normalizeLanguageList([" es "])).toEqual(["es"]);
  });

  it("drops auto, empty, and dedupes (order-preserving)", () => {
    expect(normalizeLanguageList(["auto", "en", "", "EN"])).toEqual(["en"]);
    expect(normalizeLanguageList([])).toEqual([]);
    expect(normalizeLanguageList(null)).toEqual([]);
    expect(normalizeLanguageList(undefined)).toEqual([]);
  });

  it("caps the list at five languages", () => {
    expect(normalizeLanguageList(["a", "b", "c", "d", "e", "f", "g"])).toEqual([
      "a",
      "b",
      "c",
      "d",
      "e",
    ]);
  });
});

describe("aiSdkProviderOptions", () => {
  it("sends language for openai", () => {
    expect(aiSdkProviderOptions("openai", "es", null)).toEqual({
      openai: { language: "es" },
    });
  });

  it("sends language for groq", () => {
    expect(aiSdkProviderOptions("groq", "fr", null)).toEqual({
      groq: { language: "fr" },
    });
  });

  it("sends languageCode for elevenlabs", () => {
    expect(aiSdkProviderOptions("elevenlabs", "de", null)).toEqual({
      elevenlabs: { languageCode: "de" },
    });
  });

  it("merges language with prompt bias", () => {
    expect(
      aiSdkProviderOptions("openai", "en", {
        kind: "prompt",
        text: "Terms: Freestyle.",
      }),
    ).toEqual({
      openai: { prompt: "Terms: Freestyle.", language: "en" },
    });
  });

  it("returns bias options alone when language is unset", () => {
    expect(
      aiSdkProviderOptions("groq", undefined, {
        kind: "prompt",
        text: "Terms: Freestyle.",
      }),
    ).toEqual({
      groq: { prompt: "Terms: Freestyle." },
    });
  });

  it("returns undefined when there is nothing to send", () => {
    expect(aiSdkProviderOptions("openai", undefined, null)).toBeUndefined();
    expect(aiSdkProviderOptions("openai", "auto", null)).toBeUndefined();
  });
});
