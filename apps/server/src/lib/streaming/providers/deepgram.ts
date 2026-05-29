import { createDeepgram } from "@ai-sdk/deepgram";
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

const DEEPGRAM_LISTEN_URL = "wss://api.deepgram.com/v1/listen";

export class DeepgramTranscriptionProvider implements TranscriptionProvider {
  readonly providerId = "deepgram";

  async transcribe(opts: TranscribeOptions): Promise<TranscribeResult> {
    return transcribeWithAiSdk(opts, createDeepgram);
  }

  supportsStreaming(_modelId: string): boolean {
    return true;
  }

  openStreamingSession(opts: StreamingSessionOptions): StreamSession {
    const { apiKey, model, callbacks } = opts;

    // accumulatedText holds all finalized utterances so far.
    // partialText holds the in-progress text for the current utterance.
    let accumulatedText = "";
    let partialText = "";
    let commitRequested = false;

    const short = stripProviderPrefix(model);

    const params = new URLSearchParams({
      model: short,
      encoding: "linear16",
      sample_rate: "16000",
      channels: "1",
      interim_results: "true",
      punctuate: "true",
      endpointing: "false",
      vad_events: "false",
    });

    const ws = new WebSocket(`${DEEPGRAM_LISTEN_URL}?${params}`, {
      headers: { Authorization: `Token ${apiKey}` },
    });

    ws.on("open", () => {
      callbacks.onReady(short);
    });

    ws.on("message", (raw) => {
      let msg: {
        type?: string;
        is_final?: boolean;
        speech_final?: boolean;
        channel?: {
          alternatives?: Array<{ transcript?: string }>;
        };
      };
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }

      if (msg.type !== "Results") return;

      const transcript = msg.channel?.alternatives?.[0]?.transcript ?? "";
      if (!transcript) return;

      if (msg.is_final) {
        const segment = transcript.trim();
        if (segment) {
          accumulatedText = accumulatedText
            ? `${accumulatedText} ${segment}`
            : segment;
        }
        partialText = "";

        // If the user already committed (released hotkey), send the
        // final accumulated result now that Deepgram has flushed.
        if (commitRequested) {
          commitRequested = false;
          callbacks.onFinal(accumulatedText);
        } else {
          // Show accumulated progress as partial preview
          callbacks.onPartial(accumulatedText);
        }
      } else {
        partialText = transcript;
        const preview = accumulatedText
          ? `${accumulatedText} ${partialText}`.trim()
          : partialText;
        callbacks.onPartial(preview);
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
        ws.send(chunk);
      },
      commit(): void {
        commitRequested = true;
        if (ws.readyState !== WebSocket.OPEN) {
          callbacks.onFinal(accumulatedText || partialText);
          return;
        }
        // Finalize flushes remaining audio; the is_final response
        // handler above will call onFinal with the full accumulated text.
        ws.send(JSON.stringify({ type: "Finalize" }));
      },
      cancel(): void {
        accumulatedText = "";
        partialText = "";
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "CloseStream" }));
        } else if (ws.readyState <= WebSocket.OPEN) {
          ws.close();
        }
      },
      close(): void {
        if (ws.readyState <= WebSocket.OPEN) ws.close();
      },
    };
  }
}
