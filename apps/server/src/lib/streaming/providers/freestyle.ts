import { getDb } from "../../db.js";
import type {
  TranscribeOptions,
  TranscribeResult,
  TranscriptionProvider,
} from "../types.js";
import { CLOUD_TRANSCRIBE_TIMEOUT_MS } from "../types.js";

/** Fallback when neither the setting nor the env var is set. */
const DEFAULT_CLOUD_URL = "http://localhost:8787";

/**
 * Base URL of the Freestyle cloud Worker exposing `POST /v1/transcribe`.
 * Resolution order: `settings.freestyle_cloud_url` -> `FREESTYLE_CLOUD_URL` env
 * -> {@link DEFAULT_CLOUD_URL}. Trailing slashes are stripped.
 */
function resolveCloudBaseUrl(): string {
  const db = getDb();
  const row = db
    .prepare("SELECT value FROM settings WHERE key = 'freestyle_cloud_url'")
    .get() as { value: string } | undefined;
  const raw =
    row?.value || process.env.FREESTYLE_CLOUD_URL || DEFAULT_CLOUD_URL;
  return raw.replace(/\/+$/, "");
}

/**
 * First-party provider that delegates transcription to the hosted Freestyle
 * cloud service. The org API key is stored in the local `api_keys` table under
 * the `freestyle` provider and passed through as `x-api-key`.
 *
 * Cleanup is left to the desktop pipeline (`postProcess`), so the cloud is
 * asked for the raw transcript via `x-skip-post-process`.
 */
export class FreestyleTranscriptionProvider implements TranscriptionProvider {
  readonly providerId = "freestyle";

  async transcribe(opts: TranscribeOptions): Promise<TranscribeResult> {
    const baseUrl = resolveCloudBaseUrl();

    const headers: Record<string, string> = {
      "content-type": "application/octet-stream",
      "x-api-key": opts.apiKey,
      "x-skip-post-process": "true",
    };
    if (opts.language && opts.language !== "auto") {
      headers["x-language"] = opts.language;
    }

    // Copy into a fresh, non-shared buffer so only the audio bytes are sent.
    const body = new Uint8Array(opts.audio.byteLength);
    body.set(opts.audio);

    const res = await fetch(`${baseUrl}/v1/transcribe`, {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout(CLOUD_TRANSCRIBE_TIMEOUT_MS),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(
        `Freestyle cloud transcription failed (${res.status}): ${
          detail || res.statusText
        }`,
      );
    }

    const data = (await res.json()) as { raw?: string; cleaned?: string };
    return { text: (data.raw ?? data.cleaned ?? "").trim() };
  }

  supportsStreaming(_modelId: string): boolean {
    return false;
  }
}
