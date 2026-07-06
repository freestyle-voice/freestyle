import { createElevenLabs } from "@ai-sdk/elevenlabs";
import { transcribeElevenLabsWithBias } from "../transcribe-bias.js";
import type {
  TranscribeOptions,
  TranscribeResult,
  TranscriptionProvider,
} from "../types.js";
import { stripProviderPrefix } from "../types.js";
import { transcribeWithAiSdk } from "../utils.js";

export class ElevenLabsTranscriptionProvider implements TranscriptionProvider {
  readonly providerId = "elevenlabs";

  async transcribe(opts: TranscribeOptions): Promise<TranscribeResult> {
    const model = stripProviderPrefix(opts.model).endsWith("_realtime")
      ? opts.model.replace(/_realtime$/, "")
      : opts.model;
    if (opts.bias?.kind === "elevenlabs-keyterms") {
      return transcribeElevenLabsWithBias({ ...opts, model }, opts.bias);
    }
    return transcribeWithAiSdk(
      { ...opts, model },
      createElevenLabs,
      this.providerId,
    );
  }
}
