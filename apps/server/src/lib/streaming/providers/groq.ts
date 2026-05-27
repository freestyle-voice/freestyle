import { createGroq } from "@ai-sdk/groq";
import type {
  TranscribeOptions,
  TranscribeResult,
  TranscriptionProvider,
} from "../types.js";
import { transcribeWithAiSdk } from "../utils.js";

export class GroqTranscriptionProvider implements TranscriptionProvider {
  readonly providerId = "groq";

  async transcribe(opts: TranscribeOptions): Promise<TranscribeResult> {
    return transcribeWithAiSdk(opts, createGroq);
  }

  supportsStreaming(_modelId: string): boolean {
    return false;
  }
}
