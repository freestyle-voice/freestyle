import { Buffer } from "node:buffer";
import type { AsrVocabularyBias } from "../vocabulary-bias.js";
import type { TranscribeResult } from "./types.js";
import { CLOUD_TRANSCRIBE_TIMEOUT_MS, stripProviderPrefix } from "./types.js";

interface BiasTranscribeParams {
  audio: Uint8Array;
  model: string;
  apiKey: string;
  language?: string;
}

export function providerOptionsFromBias(
  providerId: string,
  bias: AsrVocabularyBias | null | undefined,
): Record<string, Record<string, string>> | undefined {
  if (!bias || bias.kind !== "prompt") return undefined;
  if (providerId === "openai") return { openai: { prompt: bias.text } };
  if (providerId === "groq") return { groq: { prompt: bias.text } };
  return undefined;
}

/** Pre-recorded Deepgram /v1/listen (client sends WAV from the electron app). */
export async function transcribeDeepgramListen(
  opts: BiasTranscribeParams,
  bias?: Extract<
    AsrVocabularyBias,
    { kind: "deepgram-keyterms" | "deepgram-keywords" }
  > | null,
): Promise<TranscribeResult> {
  const short = stripProviderPrefix(opts.model);
  const params = new URLSearchParams({
    model: short,
    punctuate: "true",
    smart_format: "true",
  });
  params.set("language", opts.language ?? "multi");

  if (bias?.kind === "deepgram-keyterms") {
    for (const term of bias.terms) {
      params.append("keyterm", term);
    }
  } else if (bias?.kind === "deepgram-keywords") {
    for (const word of bias.terms) {
      params.append("keywords", `${word}:1.5`);
    }
  }

  const res = await fetch(`https://api.deepgram.com/v1/listen?${params}`, {
    method: "POST",
    headers: {
      Authorization: `Token ${opts.apiKey}`,
      "Content-Type": "audio/wav",
    },
    body: Buffer.from(opts.audio),
    signal: AbortSignal.timeout(CLOUD_TRANSCRIBE_TIMEOUT_MS),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(detail || `Deepgram transcription failed (${res.status})`);
  }

  const data = (await res.json()) as {
    results?: {
      channels?: Array<{
        alternatives?: Array<{ transcript?: string }>;
      }>;
    };
    metadata?: { duration?: number };
  };

  const text =
    data.results?.channels?.[0]?.alternatives?.[0]?.transcript?.trim() ?? "";

  return {
    text,
    durationInSeconds: data.metadata?.duration,
  };
}

export async function transcribeElevenLabsWithBias(
  opts: BiasTranscribeParams,
  bias: Extract<AsrVocabularyBias, { kind: "elevenlabs-keyterms" }>,
): Promise<TranscribeResult> {
  const short = stripProviderPrefix(opts.model);
  const form = new FormData();
  form.append(
    "file",
    new Blob([Buffer.from(opts.audio)], { type: "application/octet-stream" }),
    "audio.wav",
  );
  form.append("model_id", short);
  for (const term of bias.terms) {
    form.append("keyterms", term);
  }
  if (opts.language) {
    form.append("language_code", opts.language);
  }

  const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST",
    headers: { "xi-api-key": opts.apiKey },
    body: form,
    signal: AbortSignal.timeout(CLOUD_TRANSCRIBE_TIMEOUT_MS),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      detail || `ElevenLabs transcription failed (${res.status})`,
    );
  }

  const data = (await res.json()) as { text?: string };
  return { text: data.text?.trim() ?? "" };
}

export function appendDeepgramBiasToParams(
  params: URLSearchParams,
  bias: AsrVocabularyBias | null | undefined,
): void {
  if (!bias) return;
  if (bias.kind === "deepgram-keyterms") {
    for (const term of bias.terms) {
      params.append("keyterm", term);
    }
  } else if (bias.kind === "deepgram-keywords") {
    for (const word of bias.terms) {
      params.append("keywords", `${word}:1.5`);
    }
  }
}

export function appendElevenLabsBiasToParams(
  params: URLSearchParams,
  bias: AsrVocabularyBias | null | undefined,
): void {
  if (!bias || bias.kind !== "elevenlabs-keyterms") return;
  for (const term of bias.terms) {
    params.append("keyterms", term);
  }
}
