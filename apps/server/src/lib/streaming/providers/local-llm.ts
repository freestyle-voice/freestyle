import { createOpenAI } from "@ai-sdk/openai";
import { getDb } from "../../db.js";
import type {
  StreamingSessionOptions,
  StreamSession,
  TranscribeOptions,
  TranscribeResult,
  TranscriptionProvider,
} from "../types.js";
import { stripProviderPrefix } from "../types.js";
import { transcribeWithAiSdk } from "../utils.js";

function getLocalLlmSettings(): { url: string | null; apiKey: string | null } {
  const db = getDb();
  const urlRow = db
    .prepare("SELECT value FROM settings WHERE key = 'local_llm_url'")
    .get() as { value: string } | undefined;
  const keyRow = db
    .prepare("SELECT value FROM settings WHERE key = 'local_llm_api_key'")
    .get() as { value: string } | undefined;
  return {
    url: urlRow?.value?.trim() || null,
    apiKey: keyRow?.value?.trim() || null,
  };
}

export class LocalLlmTranscriptionProvider implements TranscriptionProvider {
  readonly providerId = "local-llm";

  async transcribe(opts: TranscribeOptions): Promise<TranscribeResult> {
    const { url } = getLocalLlmSettings();
    const createProvider = (config: { apiKey: string }) =>
      createOpenAI({ apiKey: config.apiKey, baseURL: url ?? undefined });
    return transcribeWithAiSdk(opts, createProvider, this.providerId);
  }

  supportsStreaming(): boolean {
    return false;
  }

  openStreamingSession(_opts: StreamingSessionOptions): StreamSession {
    throw new Error("Streaming is not supported for local-llm voice models");
  }
}
