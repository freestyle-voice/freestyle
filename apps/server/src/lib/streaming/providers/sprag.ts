import { Buffer } from "node:buffer";
import type {
  TranscribeOptions,
  TranscribeResult,
  TranscriptionProvider,
} from "../types.js";
import { CLOUD_TRANSCRIBE_TIMEOUT_MS, stripProviderPrefix } from "../types.js";

// Sprag is an OpenAI-compatible, batch-only transcription API. We talk to it
// with a direct multipart POST rather than @ai-sdk/openai: the AI SDK's
// transcription model forces response_format=verbose_json for any non-OpenAI
// model id, which Sprag rejects (400) unless timestamp_granularities[]=word is
// also set. The Qwen3 ASR model only supports `response_format` and `language`
// (no `prompt`/`temperature`), so a hand-rolled request is both simpler and the
// only way to forward the language hint without tripping the verbose_json path.
const SPRAG_TRANSCRIBE_URL = "https://api.sprag.ai/v1/audio/transcriptions";

export class SpragTranscriptionProvider implements TranscriptionProvider {
  readonly providerId = "sprag";

  async transcribe(opts: TranscribeOptions): Promise<TranscribeResult> {
    const form = new FormData();
    form.append(
      "file",
      new Blob([Buffer.from(opts.audio)], { type: "application/octet-stream" }),
      "audio.wav",
    );
    // stripProviderPrefix cuts only the first slash: "sprag/Qwen/Qwen3-ASR-1.7B"
    // -> "Qwen/Qwen3-ASR-1.7B", exactly Sprag's model field.
    form.append("model", stripProviderPrefix(opts.model));
    form.append("response_format", "json");
    if (opts.language && opts.language !== "auto") {
      form.append("language", opts.language);
    }
    // Note: the Qwen3 ASR model does not support a `prompt` field, so vocabulary
    // bias (opts.bias) is intentionally not forwarded.

    const res = await fetch(SPRAG_TRANSCRIBE_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${opts.apiKey}` },
      body: form,
      signal: AbortSignal.timeout(CLOUD_TRANSCRIBE_TIMEOUT_MS),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(detail || `Sprag transcription failed (${res.status})`);
    }

    const data = (await res.json()) as { text?: string };
    return { text: data.text?.trim() ?? "" };
  }

  supportsStreaming(_modelId: string): boolean {
    return false; // Sprag has no realtime/WebSocket API.
  }
}
