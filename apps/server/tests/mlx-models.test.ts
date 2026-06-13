import { describe, expect, it } from "vitest";
import { MLX_ASR_MODELS } from "../src/lib/mlx-asr/constants.js";

describe("MLX ASR model catalog", () => {
  it("includes SenseVoice Small as a local MLX transcription model", () => {
    const model = MLX_ASR_MODELS.find((m) => m.id === "sensevoice-small");

    expect(model).toMatchObject({
      hfId: "mlx-community/SenseVoiceSmall",
      family: "sensevoice",
      displayName: "SenseVoice",
      quantized: false,
    });
  });
});
