import { apiFetch, getApiBase, isRemoteServer } from "./api";

export interface TranscribeResult {
  raw: string;
  cleaned: string;
  error?: string;
  cloudAuthRequired?: boolean;
  usageExceeded?: boolean;
  localWhisperSetupRequired?: boolean;
  providerCategory?: string;
  /**
   * Terminal pipeline disposition from the server. A plugin that called
   * `api.control.consume()`/`abort()` in a server hook resolves to
   * `"suppressed"`/`"aborted"` here, and the dictation is dropped without
   * delivery. Defaults to `"deliver"` for older server responses.
   */
  disposition?: "deliver" | "suppressed" | "aborted";
}

/**
 * Error text attached to usage-limit results. The interactive prompt (with an
 * "Upgrade to Pro" action) is shown by the main process via
 * `window.api.cloudPromptUpgrade()` — this string only surfaces where a plain
 * error message is needed.
 */
const USAGE_LIMIT_DIALOG_MESSAGE =
  "You've used your free Freestyle Cloud dictation for this week. Upgrade to Pro for unlimited dictation, or switch to a local or bring-your-own-key model in Settings > Models.";

export interface BatchTranscriptionOptions {
  audio: Blob;
  durationMs: number;
  appContext?: string | null;
  skipPostProcess?: boolean;
  /** The streaming failure to retain if recovery also fails. */
  fallbackError?: string;
  signal?: AbortSignal;
}

/** Shared transport and result mapping for ordinary dictation and recovery. */
export async function transcribeBatch(
  options: BatchTranscriptionOptions,
): Promise<TranscribeResult> {
  const headers: Record<string, string> = {
    "Content-Type": "audio/wav",
    "x-audio-duration-ms": String(options.durationMs),
  };
  if (options.appContext)
    headers["x-app-context"] = encodeURIComponent(options.appContext);
  if (options.skipPostProcess) headers["x-skip-post-process"] = "true";
  try {
    options.signal?.throwIfAborted();
    const res = await apiFetch("/api/transcribe", {
      method: "POST",
      body: options.audio,
      headers,
      signal: options.signal,
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as {
        error?: string;
        detail?: string;
      } | null;
      const empty = { raw: "", cleaned: "" };
      if (res.status === 401 && body?.error === "cloud_auth_required")
        return {
          ...empty,
          error: "Sign in to Freestyle Transcribe",
          cloudAuthRequired: true,
        };
      if (res.status === 429 && body?.error === "usage_exceeded")
        return {
          ...empty,
          error: USAGE_LIMIT_DIALOG_MESSAGE,
          usageExceeded: true,
        };
      if (res.status === 422 && body?.error === "local_whisper_setup_failed")
        return {
          ...empty,
          error: body.detail ?? "Local Whisper needs setup",
          localWhisperSetupRequired: true,
        };
      return {
        ...empty,
        error:
          options.fallbackError ||
          body?.detail ||
          body?.error ||
          `Transcription failed (${res.status})`,
      };
    }
    const data = (await res.json()) as {
      raw?: string;
      cleaned?: string;
      provider_category?: string;
      disposition?: TranscribeResult["disposition"];
    };
    options.signal?.throwIfAborted();
    return {
      raw: (data.raw || "").trim(),
      cleaned: (data.cleaned || data.raw || "").trim(),
      providerCategory: data.provider_category,
      disposition: data.disposition,
    };
  } catch (err) {
    if (options.signal?.aborted) {
      if (
        options.signal.reason instanceof Error &&
        options.signal.reason.name === "TimeoutError"
      )
        return {
          raw: "",
          cleaned: "",
          error: "Transcription timed out. Try again.",
        };
      return { raw: "", cleaned: "", disposition: "aborted" };
    }
    const msg = err instanceof Error ? err.message : "Transcription failed";
    const hint =
      msg.includes("fetch") || msg.includes("Failed")
        ? isRemoteServer()
          ? ` (${getApiBase()} unreachable — check Settings → Network)`
          : ` (${getApiBase()} unreachable — quit and reopen the app)`
        : "";
    return {
      raw: "",
      cleaned: "",
      error: options.fallbackError || `${msg}${hint}`,
    };
  }
}
