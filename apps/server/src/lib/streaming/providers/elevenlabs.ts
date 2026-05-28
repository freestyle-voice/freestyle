import { Buffer } from "node:buffer";
import { createElevenLabs } from "@ai-sdk/elevenlabs";
import WebSocket from "ws";
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
const AUTO_COMMIT_INTERVAL_MS = 10_000;

function audioChunkMessage(b64: string, commit: boolean): string {
  return JSON.stringify({
    message_type: "input_audio_chunk",
    audio_base_64: b64,
    commit,
    sample_rate: 16000,
  });
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

export class ElevenLabsTranscriptionProvider implements TranscriptionProvider {
  readonly providerId = "elevenlabs";

  async transcribe(opts: TranscribeOptions): Promise<TranscribeResult> {
    const model = stripProviderPrefix(opts.model).endsWith("_realtime")
      ? opts.model.replace(/_realtime$/, "")
      : opts.model;
    return transcribeWithAiSdk({ ...opts, model }, createElevenLabs);
  }

  supportsStreaming(_modelId: string): boolean {
    return true;
  }

  openStreamingSession(opts: StreamingSessionOptions): StreamSession {
    const { apiKey, model, callbacks } = opts;

    // accumulatedText holds all committed segments so far.
    // partialText holds the in-progress text for the current (uncommitted) segment.
    let accumulatedText = "";
    let partialText = "";
    let ws: WebSocket | null = null;
    const pendingChunks: ArrayBuffer[] = [];
    let autoCommitTimer: ReturnType<typeof setInterval> | null = null;
    let isFinalCommit = false;

    const short = stripProviderPrefix(model);

    function startAutoCommit(): void {
      stopAutoCommit();
      autoCommitTimer = setInterval(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
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
              // Show accumulated text + current partial to the user
              const preview = accumulatedText
                ? `${accumulatedText} ${partialText}`.trim()
                : partialText;
              if (preview) callbacks.onPartial(preview);
              return;
            }
            case "committed_transcript":
            case "committed_transcript_with_timestamps": {
              const segmentText = (msg.text ?? partialText).trim();
              if (segmentText) {
                accumulatedText = accumulatedText
                  ? `${accumulatedText} ${segmentText}`
                  : segmentText;
              }
              partialText = "";

              // Only send the final result when the user-initiated commit fires
              if (isFinalCommit) {
                callbacks.onFinal(accumulatedText);
              }
              return;
            }
            case "error":
            case "auth_error":
            case "quota_exceeded":
            case "rate_limited":
            case "commit_throttled":
            case "transcriber_error":
            case "input_error":
            case "chunk_size_exceeded":
            case "insufficient_audio_activity":
              callbacks.onError(msg.error ?? "ElevenLabs error");
              return;
          }
        });

        ws.on("error", (err) => {
          callbacks.onError(err instanceof Error ? err.message : String(err));
        });

        ws.on("close", () => {
          stopAutoCommit();
          callbacks.onClose();
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
      commit(): void {
        stopAutoCommit();
        isFinalCommit = true;
        if (!ws || ws.readyState !== WebSocket.OPEN) {
          // If the WebSocket is not open, return whatever we have accumulated
          callbacks.onFinal(accumulatedText || partialText);
          return;
        }
        ws.send(audioChunkMessage("", true));
      },
      cancel(): void {
        stopAutoCommit();
        pendingChunks.length = 0;
        if (ws && ws.readyState <= WebSocket.OPEN) ws.close();
        accumulatedText = "";
        partialText = "";
      },
      close(): void {
        stopAutoCommit();
        pendingChunks.length = 0;
        if (ws && ws.readyState <= WebSocket.OPEN) ws.close();
      },
    };
  }
}
