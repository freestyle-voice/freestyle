import WebSocket from "ws";
import {
  FREESTYLE_CLOUD_PROVIDER_ID,
  FreestyleCloudAuthError,
  freestyleCloudStreamWsUrl,
  transcribeWithFreestyleCloud,
} from "../../freestyle-cloud.js";
import { createPendingAudio } from "../pending-audio.js";
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
  raw?: string;
  model?: string;
  streaming?: boolean;
  message?: string;
  code?: string;
}

/**
 * Managed STT via Freestyle Cloud. Supports both batch (POST /v2/transcribe)
 * and streaming (WSS /v2/stream) modes.
 *
 * In streaming mode, the cloud Durable Object handles Soniox STT + Groq LLM
 * post-processing. The `onFinal` callback delivers already-cleaned text, so
 * the desktop pipeline must skip local post-processing.
 *
 * `opts.apiKey` carries the cloud session token (from device auth flow).
 * Called with `mode: "raw"` in batch so the cloud skips post-processing and
 * returns only the transcript — cleanup is decided downstream by the
 * configured cleanup model, keeping cloud transcription independent from
 * cloud cleanup.
 */
export class FreestyleCloudTranscriptionProvider
  implements TranscriptionProvider
{
  readonly providerId = FREESTYLE_CLOUD_PROVIDER_ID;

  async transcribe(opts: TranscribeOptions): Promise<TranscribeResult> {
    if (!opts.apiKey) throw new FreestyleCloudAuthError();

    // The cloud reads the user's synced vocabulary from the member_preferences
    // row, so we no longer send the saved bias here. Prefer the complete live
    // selection, including `[]` for auto-detect; retain the singular language
    // fallback for older internal callers.
    const data = await transcribeWithFreestyleCloud({
      token: opts.apiKey,
      audio: opts.audio,
      ...(opts.languages !== undefined
        ? { languages: opts.languages }
        : opts.language
          ? { languages: [opts.language] }
          : {}),
      mode: "raw",
    });
    return {
      text: data.raw || "",
      ...(data.audioDurationSeconds != null
        ? { durationInSeconds: data.audioDurationSeconds }
        : {}),
    };
  }

  supportsStreaming(_modelId: string): boolean {
    return true;
  }

  openStreamingSession(opts: StreamingSessionOptions): StreamSession {
    const {
      apiKey,
      model,
      languages,
      translate,
      cleanup,
      callbacks,
      appContext,
    } = opts;

    if (!apiKey) {
      throw new FreestyleCloudAuthError();
    }

    const wsUrl = freestyleCloudStreamWsUrl();
    const ws = new WebSocket(wsUrl, {
      headers: {
        authorization: `Bearer ${apiKey}`,
      },
    });

    // Languages are a live dictation control: including the local selection
    // makes the next session correct even while cross-device preference sync or
    // a region-local Cloud cache is catching up. Other cleanup defaults remain
    // server-side; only request-scoped values travel here.
    const buildStartMessage = () => ({
      type: "start" as const,
      languages: languages ?? [],
      ...(translate ? { translate: true } : {}),
      skipPostProcess: cleanup?.skipPostProcess ?? false,
      ...(currentContext ? { context: currentContext } : {}),
      ...(cleanup?.systemFragments && cleanup.systemFragments.length > 0
        ? { systemFragments: cleanup.systemFragments }
        : {}),
    });

    let configured = false;
    let closed = false;
    const pending = createPendingAudio();
    // Track context and audio duration so we can forward them with commit.
    // The stream route updates these via context messages and the commit payload.
    let currentContext: string | null = appContext ?? null;
    let currentAudioDurationMs = 0;

    ws.on("open", () => {
      configured = true;
      // Send a start message to the DO to open the upstream Soniox session.
      ws.send(JSON.stringify(buildStartMessage()));
      pending.flush((chunk) => ws.send(Buffer.from(chunk)));
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
          callbacks.onFinal(msg.text ?? "", msg.raw);
          break;
        case "error":
          // Forward the cloud's error code (e.g. "usage_exceeded",
          // "cloud_auth_required") so the stream route can act on it.
          callbacks.onError(msg.message ?? "Unknown cloud error", msg.code);
          break;
      }
    });

    let rejected = false;
    ws.on("unexpected-response", (_req, res) => {
      rejected = true;
      const status = res.statusCode ?? 0;
      if (status === 401 || status === 403) {
        callbacks.onError(
          "Sign in to Freestyle Transcribe",
          "cloud_auth_required",
        );
      } else if (status === 429) {
        callbacks.onError(
          "Freestyle Cloud usage limit reached",
          "usage_exceeded",
        );
      } else {
        callbacks.onError(
          `Freestyle Cloud rejected the connection (${status})`,
        );
      }
      ws.terminate();
    });

    ws.on("error", (err) => {
      if (closed || rejected) return;
      callbacks.onError(
        err instanceof Error ? err.message : "Cloud WebSocket error",
      );
    });

    ws.on("close", () => {
      closed = true;
      callbacks.onClose();
    });

    return {
      sendAudio(chunk: ArrayBuffer): void {
        if (ws.readyState === WebSocket.CONNECTING || !configured) {
          pending.hold(chunk);
          return;
        }
        if (ws.readyState !== WebSocket.OPEN) return;
        ws.send(Buffer.from(chunk));
      },

      reset(): void {
        // For freestyle-cloud, reset means sending a new "start" to the DO
        // which will close the old upstream and open a fresh one.
        currentAudioDurationMs = 0;
        currentContext = null;
        // Held audio belongs to the recording that just ended.
        pending.clear();
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
        pending.clear();
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
