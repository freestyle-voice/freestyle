import { describe, expect, it } from "vitest";
import { vocabularyGuidance } from "./vocabulary-guidance";

describe("vocabularyGuidance", () => {
  it("explains when a selected model does not use vocabulary", () => {
    expect(
      vocabularyGuidance({
        provider: "local-whisper",
        model_id: "small",
        model_name: "Whisper Small",
      }),
    ).toMatchObject({ supported: false });
    expect(
      vocabularyGuidance({
        provider: "elevenlabs",
        model_id: "scribe_v1",
        model_name: "Scribe v1",
      }).detail,
    ).toContain("does not use");
  });

  it("describes model-specific phrase and term limits", () => {
    expect(
      vocabularyGuidance({
        provider: "deepgram",
        model_id: "deepgram/nova-2",
        model_name: "Nova 2",
      }).detail,
    ).toContain("single words");
    expect(
      vocabularyGuidance({
        provider: "deepgram",
        model_id: "nova-3",
        model_name: "Nova 3",
      }).detail,
    ).toContain("phrases");
    expect(
      vocabularyGuidance({
        provider: "elevenlabs",
        model_id: "elevenlabs/scribe_v2_realtime",
        model_name: "Scribe v2",
      }).detail,
    ).toContain("20 characters");
  });

  it("recognizes Cloud, OpenAI, Groq, and Soniox support without promising exact replacement", () => {
    for (const provider of ["freestyle-cloud", "openai", "groq", "soniox"]) {
      expect(
        vocabularyGuidance({ provider, model_id: "test", model_name: "Test" })
          .supported,
      ).toBe(true);
    }
    expect(vocabularyGuidance(undefined).detail).toContain(
      "Choose a transcription model",
    );
    expect(
      vocabularyGuidance({
        provider: "future-provider",
        model_id: "test",
        model_name: "Test",
      }).supported,
    ).toBe(false);
  });
});
