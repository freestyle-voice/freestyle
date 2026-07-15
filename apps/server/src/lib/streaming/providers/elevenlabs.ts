import { Buffer } from "node:buffer";
import { createElevenLabs } from "@ai-sdk/elevenlabs";
import WebSocket from "ws";
import { mergeFinalSegment } from "../segments.js";
import {
  appendElevenLabsBiasToParams,
  transcribeElevenLabsWithBias,
} from "../transcribe-bias.js";
import type {
  StreamingSessionOptions,
  StreamSession,
  TranscribeOptions,
  TranscribeResult,
  TranscriptionProvider,
} from "../types.js";
import { stripProviderPrefix } from "../types.js";
import { transcribeWithAiSdk } from "../utils.js";

const ELEVENLABS_STT_URL = "wss://api.elevenlabs.io/v1/speech-to-text/realtime";
const ELEVENLABS_TOKEN_URL =
  "https://api.elevenlabs.io/v1/single-use-token/realtime_scribe";

// Issue an intermediate commit every N milliseconds during recording
// to prevent ElevenLabs's recognition window from discarding older audio.
const AUTO_COMMIT_INTERVAL_MS = 5_000;
const USER_COMMIT_TIMEOUT_MS = 12_000;

function audioChunkMessage(b64: string, commit: boolean): string {
  return JSON.stringify({
    message_type: "input_audio_chunk",
    audio_base_64: b64,
    commit,
    sample_rate: 16000,
  });
}

/** Realtime WS expects *_realtime model ids; batch ids are mapped here. */
function resolveRealtimeModelId(model: string): string {
  const short = stripProviderPrefix(model);
  if (short.endsWith("_realtime")) return short;
  if (short === "scribe_v2") return "scribe_v2_realtime";
  return short;
}

async function getSingleUseToken(apiKey: string): Promise<string> {
  const res = await fetch(ELEVENLABS_TOKEN_URL, {
    method: "POST",
    headers: { "xi-api-key": apiKey },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`ElevenLabs token request failed (${res.status}): ${text}`);
  }
  const data = (await res.json()) as { token?: string };
  if (!data.token) {
    throw new Error("ElevenLabs token response missing token field");
  }
  return data.token;
}

/**
 * When auto-commits fire mid-speech, ElevenLabs may repeat the last few
 * words of the previous segment at the start of the next one — so overlap
 * dedup is enabled when merging segments here.
 */
const SEGMENT_OVERLAP_DEDUP_WORDS = 5;

/** Errors that mean the session cannot recover; always surface these. */
const TERMINAL_ERRORS = new Set(["auth_error", "quota_exceeded"]);

export class ElevenLabsTranscriptionProvider implements TranscriptionProvider {
  readonly providerId = "elevenlabs";

  async transcribe(opts: TranscribeOptions): Promise<TranscribeResult> {
    const model = stripProviderPrefix(opts.model).endsWith("_realtime")
      ? opts.model.replace(/_realtime$/, "")
      : opts.model;
    if (opts.bias?.kind === "elevenlabs-keyterms") {
      return transcribeElevenLabsWithBias({ ...opts, model }, opts.bias);
    }
    return transcribeWithAiSdk(
      { ...opts, model },
      createElevenLabs,
      this.providerId,
    );
  }

  supportsStreaming(modelId: string): boolean {
    const short = stripProviderPrefix(modelId);
    // Scribe v1 has no realtime WebSocket model; use batch /api/transcribe instead.
    if (short === "scribe_v1" || short.startsWith("scribe_v1_")) return false;
    return true;
  }

  openStreamingSession(opts: StreamingSessionOptions): StreamSession {
    const { apiKey, model, language, bias, callbacks } = opts;

    let accumulatedText = "";
    let partialText = "";
    let ws: WebSocket | null = null;
    const pendingChunks: ArrayBuffer[] = [];
    let autoCommitTimer: ReturnType<typeof setInterval> | null = null;
    let userCommitPending = false;
    let finalDelivered = false;
    let commitTimeout: ReturnType<typeof setTimeout> | null = null;

    const short = resolveRealtimeModelId(model);

    function clearCommitTimeout(): void {
      if (commitTimeout) {
        clearTimeout(commitTimeout);
        commitTimeout = null;
      }
    }

    function deliverUserFinal(): void {
      if (!userCommitPending || finalDelivered) return;
      userCommitPending = false;
      finalDelivered = true;
      clearCommitTimeout();
      stopAutoCommit();
      const text = (accumulatedText || partialText).trim();
      accumulatedText = "";
      partialText = "";
      callbacks.onFinal(text);
    }

    function startAutoCommit(): void {
      stopAutoCommit();
      autoCommitTimer = setInterval(() => {
        if (ws && ws.readyState === WebSocket.OPEN && !userCommitPending) {
          ws.send(audioChunkMessage("", true));
        }
      }, AUTO_COMMIT_INTERVAL_MS);
    }

    function stopAutoCommit(): void {
      if (autoCommitTimer) {
        clearInterval(autoCommitTimer);
        autoCommitTimer = null;
      }
    }

    getSingleUseToken(apiKey)
      .then((token) => {
        const params = new URLSearchParams({
          model_id: short,
          token,
          audio_format: "pcm_16000",
          commit_strategy: "manual",
        });
        if (language) {
          params.set("language_code", language);
        }
        appendElevenLabsBiasToParams(params, bias);

        ws = new WebSocket(`${ELEVENLABS_STT_URL}?${params}`);

        ws.on("open", () => {
          for (const chunk of pendingChunks) {
            ws!.send(
              audioChunkMessage(Buffer.from(chunk).toString("base64"), false),
            );
          }
          pendingChunks.length = 0;
          startAutoCommit();
          callbacks.onReady(short);
        });

        ws.on("message", (raw) => {
          let msg: {
            message_type?: string;
            text?: string;
            error?: string;
          };
          try {
            msg = JSON.parse(raw.toString());
          } catch {
            return;
          }

          switch (msg.message_type) {
            case "session_started":
              return;
            case "partial_transcript": {
              partialText = msg.text ?? "";
              const preview = accumulatedText
                ? `${accumulatedText} ${partialText}`.trim()
                : partialText;
              if (preview) callbacks.onPartial(preview);
              return;
            }
            case "committed_transcript":
            case "committed_transcript_with_timestamps": {
              accumulatedText = mergeFinalSegment(
                accumulatedText,
                msg.text ?? partialText,
                SEGMENT_OVERLAP_DEDUP_WORDS,
              );
              partialText = "";

              if (userCommitPending) {
                deliverUserFinal();
              }
              return;
            }
            case "auth_error":
            case "quota_exceeded":
            case "error":
            case "rate_limited":
            case "commit_throttled":
            case "transcriber_error":
            case "input_error":
            case "chunk_size_exceeded":
            case "insufficient_audio_activity":
              clearCommitTimeout();
              stopAutoCommit();
              if (TERMINAL_ERRORS.has(msg.message_type ?? "")) {
                // Dead key/quota: surface it instead of silently salvaging,
                // so the user learns why transcription stopped working.
                callbacks.onError(
                  msg.error ?? msg.message_type ?? "ElevenLabs error",
                );
              } else if (userCommitPending) {
                deliverUserFinal();
              } else {
                callbacks.onError(msg.error ?? "ElevenLabs error");
              }
              return;
          }
        });

        ws.on("error", (err) => {
          clearCommitTimeout();
          stopAutoCommit();
          if (userCommitPending) {
            deliverUserFinal();
          } else {
            callbacks.onError(err instanceof Error ? err.message : String(err));
          }
        });

        ws.on("close", () => {
          clearCommitTimeout();
          stopAutoCommit();
          if (userCommitPending) {
            deliverUserFinal();
          } else {
            callbacks.onClose();
          }
        });
      })
      .catch((err) => {
        callbacks.onError(err instanceof Error ? err.message : String(err));
        callbacks.onClose();
      });

    return {
      sendAudio(chunk: ArrayBuffer): void {
        if (!ws || ws.readyState !== WebSocket.OPEN) {
          pendingChunks.push(chunk);
          return;
        }
        ws.send(
          audioChunkMessage(Buffer.from(chunk).toString("base64"), false),
        );
      },
      reset(): void {
        clearCommitTimeout();
        accumulatedText = "";
        partialText = "";
        userCommitPending = false;
        finalDelivered = false;
        if (ws && ws.readyState === WebSocket.OPEN) {
          startAutoCommit();
        }
      },
      commit(): void {
        userCommitPending = true;
        finalDelivered = false;
        stopAutoCommit();
        clearCommitTimeout();

        if (!ws || ws.readyState !== WebSocket.OPEN) {
          deliverUserFinal();
          return;
        }

        ws.send(audioChunkMessage("", true));
        commitTimeout = setTimeout(() => {
          deliverUserFinal();
        }, USER_COMMIT_TIMEOUT_MS);
      },
      cancel(): void {
        clearCommitTimeout();
        stopAutoCommit();
        pendingChunks.length = 0;
        userCommitPending = false;
        finalDelivered = false;
        if (ws && ws.readyState <= WebSocket.OPEN) ws.close();
        accumulatedText = "";
        partialText = "";
      },
      close(): void {
        clearCommitTimeout();
        stopAutoCommit();
        pendingChunks.length = 0;
        userCommitPending = false;
        finalDelivered = false;
        if (ws && ws.readyState <= WebSocket.OPEN) ws.close();
      },
    };
  }
}
