import { getDb } from "../../db.js";
import { loadDictionaryEntries } from "../../dictionary-replacements.js";
import {
  FREESTYLE_CLOUD_PROVIDER_ID,
  FreestyleCloudAuthError,
  transcribeWithFreestyleCloud,
} from "../../freestyle-cloud.js";
import { loadVocabularyTerms } from "../../vocabulary.js";
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
 * Managed STT via Freestyle Cloud (batch POST /v3/transcribe).
 *
 * `opts.apiKey` carries the cloud session token (from device auth flow).
 * v3 always post-processes, so the cleaned text is returned.
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
      dictionary: loadDictionaryEntries(getDb()),
      vocabulary: loadVocabularyTerms(),
    });
    return {
      text: data.cleaned || data.raw || "",
      ...(data.audioDurationSeconds != null
        ? { durationInSeconds: data.audioDurationSeconds }
        : {}),
    };
  }
}
