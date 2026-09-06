import { describe, expect, it, vi } from "vitest";

const transcribeSpy = vi.fn().mockResolvedValue("namaste");

vi.mock("../src/lib/mlx-asr/models.js", () => ({
  getMlxModelStatus: () => ({ status: "ready" }),
}));

vi.mock("../src/lib/mlx-asr/python.js", () => ({
  describeMlxSetupBlocker: () => undefined,
}));

vi.mock("../src/lib/mlx-asr/server.js", () => ({
  applyMlxAsrRetentionPolicy: () => undefined,
  canRunMlxAsr: () => true,
  ensureMlxServerRunning: async () => undefined,
  transcribePcmWithMlxAsr: async () => "",
  transcribeWithMlxAsr: transcribeSpy,
}));

const { MlxLocalTranscriptionProvider } = await import(
  "../src/lib/streaming/providers/mlx-local.js"
);

describe("MlxLocalTranscriptionProvider", () => {
  it("converts a single Qwen language selection exactly once for batch dictation", async () => {
    await new MlxLocalTranscriptionProvider().transcribe({
      audio: new Uint8Array([1]),
      model: "local-mlx/qwen3-0.6b-8bit",
      apiKey: "unused",
      languages: ["hi"],
    });

    expect(transcribeSpy).toHaveBeenCalledWith(
      expect.objectContaining({ language: "Hindi" }),
    );
  });
});
