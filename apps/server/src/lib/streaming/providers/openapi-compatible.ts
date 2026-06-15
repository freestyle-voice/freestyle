import { createOpenAI } from "@ai-sdk/openai";
import {
  getOpenApiEndpointPreset,
  isFixedOpenApiEndpoint,
} from "@freestyle/validations";
import type {
  StreamingSessionOptions,
  StreamSession,
  TranscribeOptions,
  TranscribeResult,
  TranscriptionProvider,
} from "../types.js";
import { transcribeWithAiSdk } from "../utils.js";

export class OpenApiCompatibleTranscriptionProvider
  implements TranscriptionProvider
{
  readonly providerId: string;

  constructor(providerId: string) {
    this.providerId = providerId;
  }

  async transcribe(opts: TranscribeOptions): Promise<TranscribeResult> {
    const preset = getOpenApiEndpointPreset(this.providerId);
    if (!preset || !isFixedOpenApiEndpoint(preset.endpoint)) {
      throw new Error(
        `No fixed OpenAPI-compatible endpoint configured for provider: ${this.providerId}`,
      );
    }

    const endpoint = preset.endpoint.replace(/\/+$/, "");
    const createProvider = (config: { apiKey: string }) =>
      createOpenAI({ apiKey: config.apiKey, baseURL: endpoint });

    return transcribeWithAiSdk(opts, createProvider, this.providerId);
  }

  supportsStreaming(): boolean {
    return false;
  }

  openStreamingSession(_opts: StreamingSessionOptions): StreamSession {
    throw new Error(
      `Streaming is not supported for OpenAPI-compatible provider: ${this.providerId}`,
    );
  }
}
