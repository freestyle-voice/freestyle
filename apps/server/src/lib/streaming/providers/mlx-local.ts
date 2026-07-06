import { createAppLogger } from "@freestyle-voice/utils";
import { collapseAsrLineBreaks } from "../../editor/model-hints.js";
import { MLX_ASR_PROVIDER_ID } from "../../mlx-asr/constants.js";
import { resolveMlxLanguage } from "../../mlx-asr/language.js";
import { getMlxModelStatus } from "../../mlx-asr/models.js";
import { describeMlxSetupBlocker } from "../../mlx-asr/python.js";
import { canRunMlxAsr, transcribeWithMlxAsr } from "../../mlx-asr/server.js";
import type {
  TranscribeOptions,
  TranscribeResult,
  TranscriptionProvider,
} from "../types.js";
import { stripProviderPrefix } from "../types.js";

const log = createAppLogger("mlx-asr");

export class MlxLocalTranscriptionProvider implements TranscriptionProvider {
  readonly providerId = MLX_ASR_PROVIDER_ID;

  async transcribe(opts: TranscribeOptions): Promise<TranscribeResult> {
    const modelId = stripProviderPrefix(opts.model);

    if (!canRunMlxAsr()) {
      throw new Error(
        describeMlxSetupBlocker() ??
          "MLX ASR is not available. Install the bundled worker or run: pip install mlx-audio",
      );
    }
    if (getMlxModelStatus(modelId)?.status !== "ready") {
      throw new Error("MLX ASR model is not downloaded yet.");
    }

    const t0 = Date.now();
    const text = await transcribeWithMlxAsr({
      modelId,
      audio: opts.audio,
      language: resolveMlxLanguage(modelId, opts.language),
      context: opts.bias?.kind === "prompt" ? opts.bias.text : undefined,
    });

    log.debug(`inference took ${Date.now() - t0}ms`);

    return { text: collapseAsrLineBreaks(text).trim() };
  }
}
