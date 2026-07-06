import { createOpenAI } from "@ai-sdk/openai";
import type {
  TranscribeOptions,
  TranscribeResult,
  TranscriptionProvider,
} from "../types.js";
import { transcribeWithAiSdk } from "../utils.js";

export class OpenAITranscriptionProvider implements TranscriptionProvider {
  readonly providerId = "openai";

  async transcribe(opts: TranscribeOptions): Promise<TranscribeResult> {
    return transcribeWithAiSdk(opts, createOpenAI, this.providerId);
  }
}
