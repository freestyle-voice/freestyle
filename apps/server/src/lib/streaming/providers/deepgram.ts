import { createDeepgram } from "@ai-sdk/deepgram";
import WebSocket from "ws";
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
import { transcribeWithAiSdk } from "../utils.js";

const DEEPGRAM_LISTEN_URL = "wss://api.deepgram.com/v1/listen";
const COMMIT_TIMEOUT_MS = 12_000;

/**
 * Merge a new finalized segment. Nova models often send cumulative transcripts
 * (full text so far) rather than deltas — appending would duplicate lines.
 */
function mergeFinalSegment(prev: string, next: string): string {
  const p = prev.trim();
  const n = next.trim();
  if (!n) return p;
  if (!p) return n;
  if (n === p) return p;
  if (n.startsWith(p)) return n;
  if (p.startsWith(n)) return p;

  const prevWords = p.split(/\s+/);
  const nextWords = n.split(/\s+/);
  const maxOverlap = Math.min(5, prevWords.length, nextWords.length);
  let overlapLen = 0;
  for (let i = 1; i <= maxOverlap; i++) {
    const tail = prevWords.slice(-i).join(" ").toLowerCase();
    const head = nextWords.slice(0, i).join(" ").toLowerCase();
    if (tail === head) overlapLen = i;
  }
  if (overlapLen > 0) {
    return `${p} ${nextWords.slice(overlapLen).join(" ")}`.trim();
  }
  return `${p} ${n}`;
}

function previewText(accumulated: string, partial: string): string {
  const a = accumulated.trim();
  const p = partial.trim();
  if (!p) return a;
  if (!a) return p;
  if (p.startsWith(a)) return p;
  if (a.startsWith(p)) return a;
  return `${a} ${p}`.trim();
}

export class DeepgramTranscriptionProvider implements TranscriptionProvider {
  readonly providerId = "deepgram";

  async transcribe(opts: TranscribeOptions): Promise<TranscribeResult> {
    const bias = opts.bias;
    if (
      bias?.kind === "deepgram-keyterms" ||
      bias?.kind === "deepgram-keywords"
    ) {
      return transcribeDeepgramListen(opts, bias);
    }
    return transcribeWithAiSdk(opts, createDeepgram, this.providerId);
  }

  supportsStreaming(_modelId: string): boolean {
    return true;
  }

  openStreamingSession(opts: StreamingSessionOptions): StreamSession {
    const { apiKey, model, bias, callbacks } = opts;

    let accumulatedText = "";
    let partialText = "";
    let commitRequested = false;
    let finalDelivered = false;
    let commitTimeout: ReturnType<typeof setTimeout> | null = null;

    function clearCommitTimeout(): void {
      if (commitTimeout) {
        clearTimeout(commitTimeout);
        commitTimeout = null;
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
        const segment = transcript.trim();
        if (segment) {
          accumulatedText = mergeFinalSegment(accumulatedText, segment);
        }
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
        if (ws.readyState <= WebSocket.OPEN) ws.close();
      },
    };
  }
}
