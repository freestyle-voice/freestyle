import { afterEach, describe, expect, it, vi } from "vitest";

const transcribeSpy = vi.fn().mockResolvedValue({ raw: "done" });

vi.mock("../src/lib/freestyle-cloud.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../src/lib/freestyle-cloud.js")>();
  return { ...actual, transcribeWithFreestyleCloud: transcribeSpy };
});

const { FreestyleCloudTranscriptionProvider } = await import(
  "../src/lib/streaming/providers/freestyle-cloud.js"
);

describe("FreestyleCloudTranscriptionProvider", () => {
  afterEach(() => {
    transcribeSpy.mockClear();
  });

  it("forwards the full live language selection for raw dictation", async () => {
    await new FreestyleCloudTranscriptionProvider().transcribe({
      audio: new Uint8Array([1]),
      model: "freestyle-cloud/stt",
      apiKey: "t",
      language: "en",
      languages: ["en", "hi"],
    });

    expect(transcribeSpy).toHaveBeenCalledWith(
      expect.objectContaining({ languages: ["en", "hi"], mode: "raw" }),
    );
  });

  it("forwards an explicit empty selection for Cloud auto-detect", async () => {
    await new FreestyleCloudTranscriptionProvider().transcribe({
      audio: new Uint8Array([1]),
      model: "freestyle-cloud/stt",
      apiKey: "t",
      languages: [],
    });

    expect(transcribeSpy).toHaveBeenCalledWith(
      expect.objectContaining({ languages: [], mode: "raw" }),
    );
  });
});
