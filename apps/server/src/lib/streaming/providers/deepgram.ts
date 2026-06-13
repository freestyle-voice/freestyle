import WebSocket from "ws";
import { mergeFinalSegment, previewText } from "../segments.js";
import {
  appendDeepgramBiasToParams,
  transcribeDeepgramListen,
} from "../transcribe-bias.js";
import type {
  StreamingSessionOptions,
  StreamSession,
  TranscribeOptions,
  TranscribeResult,
  TranscriptionProvider,
} from "../types.js";
import { stripProviderPrefix } from "../types.js";

const DEEPGRAM_LISTEN_URL = "wss://api.deepgram.com/v1/listen";
const COMMIT_TIMEOUT_MS = 12_000;
// Deepgram closes streaming sockets after ~10s without audio (NET-0001);
// KeepAlive holds the connection open between recordings.
const KEEPALIVE_INTERVAL_MS = 5_000;

export class DeepgramTranscriptionProvider implements TranscriptionProvider {
  readonly providerId = "deepgram";

  async transcribe(opts: TranscribeOptions): Promise<TranscribeResult> {
    const bias =
      opts.bias?.kind === "deepgram-keyterms" ||
      opts.bias?.kind === "deepgram-keywords"
        ? opts.bias
        : null;
    return transcribeDeepgramListen(opts, bias);
  }

  supportsStreaming(_modelId: string): boolean {
    return true;
  }

  openStreamingSession(opts: StreamingSessionOptions): StreamSession {
    const { apiKey, model, language, bias, callbacks } = opts;

    let accumulatedText = "";
    let partialText = "";
    let commitRequested = false;
    let finalDelivered = false;
    let commitTimeout: ReturnType<typeof setTimeout> | null = null;
    let keepAlive: ReturnType<typeof setInterval> | null = null;

    function clearCommitTimeout(): void {
      if (commitTimeout) {
        clearTimeout(commitTimeout);
        commitTimeout = null;
      }
    }

    function stopKeepAlive(): void {
      if (keepAlive) {
        clearInterval(keepAlive);
        keepAlive = null;
      }
    }

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
    params.set("language", language ?? "multi");
    appendDeepgramBiasToParams(params, bias);

    const ws = new WebSocket(`${DEEPGRAM_LISTEN_URL}?${params}`, {
      headers: { Authorization: `Token ${apiKey}` },
    });

    function deliverFinal(): void {
      if (finalDelivered) return;
      finalDelivered = true;
      commitRequested = false;
      clearCommitTimeout();
      const text = (accumulatedText || partialText).trim();
      accumulatedText = "";
      partialText = "";
      callbacks.onFinal(text);
    }

    ws.on("open", () => {
      keepAlive = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "KeepAlive" }));
        }
      }, KEEPALIVE_INTERVAL_MS);
      callbacks.onReady(short);
    });

    ws.on("message", (raw) => {
      let msg: {
        type?: string;
        is_final?: boolean;
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
        accumulatedText = mergeFinalSegment(accumulatedText, transcript);
        partialText = "";

        if (commitRequested) {
          deliverFinal();
        } else {
          callbacks.onPartial(accumulatedText);
        }
      } else {
        partialText = transcript;
        callbacks.onPartial(previewText(accumulatedText, partialText));
      }
    });

    ws.on("error", (err) => {
      stopKeepAlive();
      callbacks.onError(err instanceof Error ? err.message : String(err));
    });

    ws.on("close", () => {
      stopKeepAlive();
      callbacks.onClose();
    });

    return {
      sendAudio(chunk: ArrayBuffer): void {
        if (ws.readyState !== WebSocket.OPEN) return;
        ws.send(chunk);
      },
      reset(): void {
        clearCommitTimeout();
        accumulatedText = "";
        partialText = "";
        commitRequested = false;
        finalDelivered = false;
      },
      commit(): void {
        commitRequested = true;
        clearCommitTimeout();
        if (ws.readyState !== WebSocket.OPEN) {
          deliverFinal();
          return;
        }
        ws.send(JSON.stringify({ type: "Finalize" }));
        commitTimeout = setTimeout(() => {
          deliverFinal();
        }, COMMIT_TIMEOUT_MS);
      },
      cancel(): void {
        clearCommitTimeout();
        accumulatedText = "";
        partialText = "";
        commitRequested = false;
        finalDelivered = false;
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "CloseStream" }));
        } else if (ws.readyState <= WebSocket.OPEN) {
          ws.close();
        }
      },
      close(): void {
        clearCommitTimeout();
        stopKeepAlive();
        if (ws.readyState <= WebSocket.OPEN) ws.close();
      },
    };
  }
}
