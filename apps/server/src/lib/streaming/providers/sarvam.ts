import { Buffer } from "node:buffer";
import type {
  TranscribeOptions,
  TranscribeResult,
  TranscriptionProvider,
} from "../types.js";
import { stripProviderPrefix } from "../types.js";

export class SarvamTranscriptionProvider implements TranscriptionProvider {
  readonly providerId = "sarvam";

  async transcribe(opts: TranscribeOptions): Promise<TranscribeResult> {
    const { apiKey, model, audio, language } = opts;
    const modelId = stripProviderPrefix(model);

    const blob = new Blob([Buffer.from(audio)], { type: "audio/wav" });
    const formData = new FormData();
    formData.append("file", blob, "audio.wav");
    formData.append("model", modelId || "saaras:v3");

    if (language && language !== "auto") {
      formData.append("language_code", language);
    }

    const res = await fetch("https://api.sarvam.ai/speech-to-text", {
      method: "POST",
      headers: {
        "api-subscription-key": apiKey,
      },
      body: formData,
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Sarvam AI API error: ${res.status} - ${errorText}`);
    }

    const data = await res.json();
    return {
      text: data.transcript || "",
    };
  }

  supportsStreaming(_modelId: string): boolean {
    return false;
  }
}
