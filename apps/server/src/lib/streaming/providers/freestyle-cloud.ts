import type {
  TranscribeOptions,
  TranscribeResult,
  TranscriptionProvider,
} from "../types.js";

/** Provider id used across the catalog, registry, and credential lookup. */
export const FREESTYLE_CLOUD_PROVIDER_ID = "freestyle-cloud";

/**
 * Thrown when the cloud rejects the request for auth reasons (missing/expired
 * session). The transcribe route maps this to a `cloud_auth_required` response
 * so the desktop app can prompt the user to sign in again.
 */
export class CloudAuthError extends Error {
  constructor(message = "Freestyle Cloud sign-in required") {
    super(message);
    this.name = "CloudAuthError";
  }
}

/**
 * Hosted Freestyle Cloud STT endpoint. Override with FREESTYLE_CLOUD_URL for
 * local development (e.g. http://localhost:8787 against `wrangler dev`).
 */
const DEFAULT_BASE_URL = "https://freestyle-server.matt8p.workers.dev";
const TRANSCRIBE_PATH = "/v1/transcribe";

interface CloudTranscribeResponse {
  raw: string;
  cleaned: string;
  sttModel: string;
  cleanupModel: string | null;
  audioDurationSeconds: number | null;
  usage: { inputTokens: number; outputTokens: number };
}

function resolveBaseUrl(): string {
  return (process.env.FREESTYLE_CLOUD_URL || DEFAULT_BASE_URL).replace(
    /\/+$/,
    "",
  );
}

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
    if (!opts.apiKey) {
      throw new CloudAuthError();
    }

    const headers: Record<string, string> = {
      authorization: `Bearer ${opts.apiKey}`,
    };
    if (opts.language) headers["x-language"] = opts.language;

    // Audio reaches providers as a complete 16kHz mono 16-bit WAV; it's always
    // ArrayBuffer-backed (it comes from the HTTP body), so send the bytes as-is.
    const audio = opts.audio as Uint8Array<ArrayBuffer>;
    const res = await fetch(`${resolveBaseUrl()}${TRANSCRIBE_PATH}`, {
      method: "POST",
      headers,
      body: new Blob([audio], { type: "audio/wav" }),
    });

    if (res.status === 401) {
      throw new CloudAuthError();
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(
        `Freestyle Cloud transcription failed (${res.status})${detail ? `: ${detail}` : ""}`,
      );
    }

    const data = (await res.json()) as CloudTranscribeResponse;
    return {
      // Cloud already cleaned the text (falls back to raw when its own cleanup
      // is unavailable); local post-processing is disabled for this provider.
      text: data.cleaned ?? data.raw ?? "",
      ...(data.audioDurationSeconds != null
        ? { durationInSeconds: data.audioDurationSeconds }
        : {}),
    };
  }

  supportsStreaming(_modelId: string): boolean {
    return false;
  }
}
