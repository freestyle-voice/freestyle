import { transcribeDeepgramListen } from "../transcribe-bias.js";
import type {
  TranscribeOptions,
  TranscribeResult,
  TranscriptionProvider,
} from "../types.js";

export class DeepgramTranscriptionProvider implements TranscriptionProvider {
  readonly providerId = "deepgram";

  async transcribe(opts: TranscribeOptions): Promise<TranscribeResult> {
    const bias =
      opts.bias?.kind === "deepgram-keyterms" ||
      opts.bias?.kind === "deepgram-keywords"
        ? opts.bias
        : null;
    return transcribeDeepgramListen(opts, bias);
  }
}
