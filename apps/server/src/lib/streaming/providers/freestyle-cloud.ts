import {
  FREESTYLE_CLOUD_PROVIDER_ID,
  FreestyleCloudAuthError,
  transcribeWithFreestyleCloud,
} from "../../freestyle-cloud.js";
import type {
  TranscribeOptions,
  TranscribeResult,
  TranscriptionProvider,
} from "../types.js";

export {
  FREESTYLE_CLOUD_PROVIDER_ID,
  FreestyleCloudAuthError as CloudAuthError,
};

/**
 * Managed STT via Freestyle Cloud (batch POST /v2/transcribe).
 *
 * `opts.apiKey` carries the cloud session token (from device auth flow).
 * Called with `mode: "raw"` so the cloud skips post-processing and returns
 * only the transcript — cleanup is decided downstream by the configured
 * cleanup model, keeping cloud transcription independent from cloud cleanup.
 */
export class FreestyleCloudTranscriptionProvider
  implements TranscriptionProvider
{
  readonly providerId = FREESTYLE_CLOUD_PROVIDER_ID;

  async transcribe(opts: TranscribeOptions): Promise<TranscribeResult> {
    if (!opts.apiKey) throw new FreestyleCloudAuthError();

    const data = await transcribeWithFreestyleCloud({
      token: opts.apiKey,
      audio: opts.audio,
      language: opts.language,
      mode: "raw",
    });
    return {
      text: data.raw || "",
      ...(data.audioDurationSeconds != null
        ? { durationInSeconds: data.audioDurationSeconds }
        : {}),
    };
  }
}
