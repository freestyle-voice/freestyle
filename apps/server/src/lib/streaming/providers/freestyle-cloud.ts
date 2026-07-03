import WebSocket from "ws";
import {
  FREESTYLE_CLOUD_PROVIDER_ID,
  FreestyleCloudAuthError,
  freestyleCloudStreamWsUrl,
  transcribeWithFreestyleCloud,
} from "../../freestyle-cloud.js";
import type {
  StreamingSessionOptions,
  StreamSession,
  TranscribeOptions,
  TranscribeResult,
  TranscriptionProvider,
} from "../types.js";

export {
  FREESTYLE_CLOUD_PROVIDER_ID,
  FreestyleCloudAuthError as CloudAuthError,
};

/**
 * Cloud message types received from the SttSession Durable Object.
 */
interface CloudServerMessage {
  type: "config" | "session.ready" | "partial" | "final" | "error";
  text?: string;
  model?: string;
  streaming?: boolean;
  message?: string;
  code?: string;
}

/**
 * Managed STT via Freestyle Cloud. Supports both batch (POST /v1/transcribe)
 * and streaming (WSS /v1/stream) modes.
 *
 * In streaming mode, the cloud Durable Object handles Soniox STT + Groq LLM
 * post-processing. The `onFinal` callback delivers already-cleaned text, so
 * the desktop pipeline must skip local post-processing.
 *
 * `opts.apiKey` carries the cloud session token (from device auth flow).
 */
export class FreestyleCloudTranscriptionProvider
  implements TranscriptionProvider
{
  readonly providerId = FREESTYLE_CLOUD_PROVIDER_ID;

  async transcribe(opts: TranscribeOptions): Promise<TranscribeResult> {
    if (!opts.apiKey) throw new FreestyleCloudAuthError();

    const data = await transcribeWithFreestyleCloud({
      token: opts.apiKey,
      audio: opts.audio,
      language: opts.language,
      mode: "raw",
    });
    return {
      text: data.raw ?? data.cleaned ?? "",
      ...(data.audioDurationSeconds != null
        ? { durationInSeconds: data.audioDurationSeconds }
        : {}),
    };
  }

  supportsStreaming(_modelId: string): boolean {
    return true;
  }

  openStreamingSession(opts: StreamingSessionOptions): StreamSession {
    const { apiKey, model, language, cleanup, callbacks } = opts;

    if (!apiKey) {
      throw new FreestyleCloudAuthError();
    }

    const wsUrl = freestyleCloudStreamWsUrl();
    const ws = new WebSocket(wsUrl, {
      headers: {
        authorization: `Bearer ${apiKey}`,
      },
    });

    // The DO applies cleanup preferences on `start`. Mirror the batch
    // `/v2/transcribe` payload: send `skipPostProcess` plus intensity, custom
    // prompt, and destination-aware tones so the cloud cleans (or skips) and
    // bills exactly like batch. `appAssignments` travels as a real array over
    // the JSON WebSocket message.
    const buildStartMessage = () => ({
      type: "start" as const,
      language: language || undefined,
      skipPostProcess: cleanup?.skipPostProcess ?? false,
      ...(cleanup && !cleanup.skipPostProcess
        ? {
            intensity: cleanup.intensity,
            customPrompt: cleanup.customPrompt,
            personalTone: cleanup.personalTone,
            workTone: cleanup.workTone,
            emailTone: cleanup.emailTone,
            overallTone: cleanup.overallTone,
            appAssignments: cleanup.appAssignments,
          }
        : {}),
    });

    let configured = false;
    let closed = false;
    // Track context and audio duration so we can forward them with commit.
    // The stream route sets these via context messages and the commit payload.
    let currentContext: string | null = null;
    let currentAudioDurationMs = 0;

    ws.on("open", () => {
      configured = true;
      // Send a start message to the DO to open the upstream Soniox session.
      ws.send(JSON.stringify(buildStartMessage()));
    });

    ws.on("message", (raw) => {
      let msg: CloudServerMessage;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }

      switch (msg.type) {
        case "config":
          // Initial config from the DO — no action needed, wait for session.ready.
          break;
        case "session.ready":
          callbacks.onReady(msg.model || model);
          break;
        case "partial":
          if (msg.text) callbacks.onPartial(msg.text);
          break;
        case "final":
          // The cloud DO already ran Groq LLM post-processing.
          // Deliver as-is — the desktop must NOT re-run postProcess().
          callbacks.onFinal(msg.text ?? "");
          break;
        case "error":
          // Forward the cloud's error code (e.g. "usage_exceeded",
          // "cloud_auth_required") so the stream route can act on it.
          callbacks.onError(msg.message ?? "Unknown cloud error", msg.code);
          break;
      }
    });

    ws.on("error", (err) => {
      if (!closed) {
        callbacks.onError(
          err instanceof Error ? err.message : "Cloud WebSocket error",
        );
      }
    });

    ws.on("close", () => {
      closed = true;
      callbacks.onClose();
    });

    return {
      sendAudio(chunk: ArrayBuffer): void {
        if (ws.readyState !== WebSocket.OPEN || !configured) return;
        ws.send(Buffer.from(chunk));
      },

      reset(): void {
        // For freestyle-cloud, reset means sending a new "start" to the DO
        // which will close the old upstream and open a fresh one.
        currentAudioDurationMs = 0;
        currentContext = null;
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(buildStartMessage()));
        }
      },

      setContext(context: string | null): void {
        currentContext = context;
        // Also forward to the DO so it can use it for post-processing.
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "context", context: context ?? "" }));
        }
      },

      setAudioDurationMs(ms: number): void {
        currentAudioDurationMs = ms;
      },

      commit(): void {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              type: "commit",
              audioDurationMs: currentAudioDurationMs,
              context: currentContext,
            }),
          );
        }
      },

      cancel(): void {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "cancel" }));
        }
        currentAudioDurationMs = 0;
      },

      close(): void {
        closed = true;
        if (ws.readyState <= WebSocket.OPEN) {
          ws.close();
        }
      },
    };
  }
}
