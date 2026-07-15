import { Buffer } from "node:buffer";
import { createOpenAI } from "@ai-sdk/openai";
import WebSocket from "ws";
import { createPcmUpsampler } from "../pcm.js";
import type {
  StreamingSessionOptions,
  StreamSession,
  TranscribeOptions,
  TranscribeResult,
  TranscriptionProvider,
} from "../types.js";
import { stripProviderPrefix } from "../types.js";
import { transcribeWithAiSdk } from "../utils.js";

const REALTIME_URL = "wss://api.openai.com/v1/realtime?intent=transcription";
const COMMIT_TIMEOUT_MS = 12_000;
const CLIENT_SAMPLE_RATE = 16_000;
const REALTIME_SAMPLE_RATE = 24_000;

export class OpenAITranscriptionProvider implements TranscriptionProvider {
  readonly providerId = "openai";

  async transcribe(opts: TranscribeOptions): Promise<TranscribeResult> {
    return transcribeWithAiSdk(opts, createOpenAI, this.providerId);
  }

  supportsStreaming(modelId: string): boolean {
    return stripProviderPrefix(modelId).includes("transcribe");
  }

  openStreamingSession(opts: StreamingSessionOptions): StreamSession {
    const { apiKey, model, language, bias, callbacks } = opts;
    const short = stripProviderPrefix(model);
    let partialText = "";
    let configured = false;
    let finalDelivered = false;
    let commitTimeout: ReturnType<typeof setTimeout> | null = null;

    function clearCommitTimeout(): void {
      if (commitTimeout) {
        clearTimeout(commitTimeout);
        commitTimeout = null;
      }
    }

    function deliverFinal(text: string): void {
      if (finalDelivered) return;
      finalDelivered = true;
      clearCommitTimeout();
      partialText = "";
      callbacks.onFinal(text.trim());
    }

    const upsample = createPcmUpsampler(
      CLIENT_SAMPLE_RATE,
      REALTIME_SAMPLE_RATE,
    );

    const ws = new WebSocket(REALTIME_URL, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    ws.on("open", () => {
      const transcription: Record<string, unknown> = { model: short };
      if (language) transcription.language = language;
      if (bias?.kind === "prompt") transcription.prompt = bias.text;

      ws.send(
        JSON.stringify({
          type: "session.update",
          session: {
            type: "transcription",
            audio: {
              input: {
                format: { type: "audio/pcm", rate: REALTIME_SAMPLE_RATE },
                transcription,
                turn_detection: null,
              },
            },
          },
        }),
      );
    });

    ws.on("message", (raw) => {
      let evt: { type: string; [k: string]: unknown };
      try {
        evt = JSON.parse(raw.toString());
      } catch {
        return;
      }
      switch (evt.type) {
        case "transcription_session.created":
        case "transcription_session.updated":
        case "session.created":
        case "session.updated":
          if (!configured) {
            configured = true;
            callbacks.onReady(short);
          }
          return;
        case "conversation.item.input_audio_transcription.delta": {
          const delta = typeof evt.delta === "string" ? evt.delta : "";
          partialText += delta;
          callbacks.onPartial(partialText);
          return;
        }
        case "conversation.item.input_audio_transcription.completed": {
          const text =
            typeof evt.transcript === "string" ? evt.transcript : partialText;
          deliverFinal(text);
          return;
        }
        case "error": {
          const err = evt.error as { message?: string } | undefined;
          const message =
            err?.message ??
            (typeof evt.message === "string" ? evt.message : "OpenAI error");
          callbacks.onError(message);
          return;
        }
      }
    });

    ws.on("error", (err) => {
      callbacks.onError(err instanceof Error ? err.message : String(err));
    });

    ws.on("close", () => {
      callbacks.onClose();
    });

    return {
      sendAudio(chunk: ArrayBuffer): void {
        if (ws.readyState !== WebSocket.OPEN) return;
        const b64 = Buffer.from(upsample(chunk)).toString("base64");
        ws.send(
          JSON.stringify({
            type: "input_audio_buffer.append",
            audio: b64,
          }),
        );
      },
      commit(): void {
        finalDelivered = false;
        if (ws.readyState !== WebSocket.OPEN) {
          deliverFinal(partialText);
          return;
        }
        ws.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
        // Don't hang the recording if "completed" never arrives.
        clearCommitTimeout();
        commitTimeout = setTimeout(() => {
          deliverFinal(partialText);
        }, COMMIT_TIMEOUT_MS);
      },
      reset(): void {
        clearCommitTimeout();
        partialText = "";
        finalDelivered = false;
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "input_audio_buffer.clear" }));
        }
      },
      cancel(): void {
        clearCommitTimeout();
        partialText = "";
        finalDelivered = false;
        if (ws.readyState !== WebSocket.OPEN) return;
        ws.send(JSON.stringify({ type: "input_audio_buffer.clear" }));
      },
      close(): void {
        clearCommitTimeout();
        if (ws.readyState <= WebSocket.OPEN) ws.close();
      },
    };
  }
}
