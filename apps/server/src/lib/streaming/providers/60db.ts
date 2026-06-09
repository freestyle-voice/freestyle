import { transcribe60db } from "../transcribe-bias.js";
import type {
  TranscribeOptions,
  TranscribeResult,
  TranscriptionProvider,
} from "../types.js";

/**
 * 60dB speech-to-text. Batch only (record-then-transcribe) via the
 * REST `POST /stt` endpoint — 60dB has no realtime model wired here, so
 * `supportsStreaming` always returns false and the /stream route falls
 * back to the non-streaming REST path, mirroring ElevenLabs Scribe V1.
 */
export class SixtyDbTranscriptionProvider implements TranscriptionProvider {
  readonly providerId = "60db";

  async transcribe(opts: TranscribeOptions): Promise<TranscribeResult> {
    const bias = opts.bias?.kind === "60db-keywords" ? opts.bias : null;
    return transcribe60db(opts, bias);
  }

  supportsStreaming(): boolean {
    return false;
  }
}
