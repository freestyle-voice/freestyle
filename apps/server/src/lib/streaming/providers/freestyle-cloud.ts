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
 * Managed STT via the Freestyle Cloud `/v1/transcribe` endpoint. Requires a
 * signed-in user: `opts.apiKey` carries the cloud session token, attached as
 * `Authorization: Bearer`. The endpoint runs its own cleanup pass, so the
 * desktop app disables local post-processing for this provider and surfaces the
 * cloud's `cleaned` text directly. Batch-only — no streaming.
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
      text: data.raw ?? data.cleaned ?? "",
      ...(data.audioDurationSeconds != null
        ? { durationInSeconds: data.audioDurationSeconds }
        : {}),
    };
  }

  supportsStreaming(_modelId: string): boolean {
    return false;
  }
}
