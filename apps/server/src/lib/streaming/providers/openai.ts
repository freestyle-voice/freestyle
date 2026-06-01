import { Buffer } from "node:buffer";
import { createOpenAI } from "@ai-sdk/openai";
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

const REALTIME_URL = "wss://api.openai.com/v1/realtime?intent=transcription";

export class OpenAITranscriptionProvider implements TranscriptionProvider {
  readonly providerId = "openai";

  async transcribe(opts: TranscribeOptions): Promise<TranscribeResult> {
    return transcribeWithAiSdk(opts, createOpenAI, this.providerId);
  }

  supportsStreaming(modelId: string): boolean {
    return stripProviderPrefix(modelId).includes("transcribe");
  }

  openStreamingSession(opts: StreamingSessionOptions): StreamSession {
    const { apiKey, model, bias, callbacks } = opts;
    const short = stripProviderPrefix(model);
    let partialText = "";
    let configured = false;

    const ws = new WebSocket(REALTIME_URL, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "OpenAI-Beta": "realtime=v1",
      },
    });

    ws.on("open", () => {
      const transcription: Record<string, unknown> = { model: short };
      if (bias?.kind === "prompt") transcription.prompt = bias.text;

      ws.send(
        JSON.stringify({
          type: "transcription_session.update",
          session: {
            input_audio_format: "pcm16",
            input_audio_transcription: transcription,
            turn_detection: null,
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
          callbacks.onFinal(text.trim());
          partialText = "";
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
        const b64 = Buffer.from(chunk).toString("base64");
        ws.send(
          JSON.stringify({
            type: "input_audio_buffer.append",
            audio: b64,
          }),
        );
      },
      commit(): void {
        if (ws.readyState !== WebSocket.OPEN) {
          const text = partialText.trim();
          partialText = "";
          callbacks.onFinal(text);
          return;
        }
        ws.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
      },
      reset(): void {
        partialText = "";
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "input_audio_buffer.clear" }));
        }
      },
      cancel(): void {
        if (ws.readyState !== WebSocket.OPEN) return;
        ws.send(JSON.stringify({ type: "input_audio_buffer.clear" }));
        partialText = "";
      },
      close(): void {
        if (ws.readyState <= WebSocket.OPEN) ws.close();
      },
    };
  }
}
