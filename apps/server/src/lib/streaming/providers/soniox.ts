import WebSocket from "ws";
import {
  sonioxContextFromBias,
  sonioxGeneralFromAppContext,
} from "../transcribe-bias.js";
import type {
  StreamingSessionOptions,
  StreamSession,
  TranscribeOptions,
  TranscribeResult,
  TranscriptionProvider,
} from "../types.js";
import { stripProviderPrefix } from "../types.js";

const SONIOX_WS_URL = "wss://stt-rt.soniox.com/transcribe-websocket";
const COMMIT_TIMEOUT_MS = 8_000;
const KEEPALIVE_INTERVAL_MS = 10_000;
const FIN_TOKEN = "<fin>";
const MAX_PENDING_CHUNKS = 1024;

interface SonioxToken {
  text?: string;
  is_final?: boolean;
  translation_status?: "original" | "translation";
}

function renderTokens(
  finalTokens: SonioxToken[],
  nonFinalTokens: SonioxToken[],
): string {
  return [...finalTokens, ...nonFinalTokens].map((t) => t.text ?? "").join("");
}

function languageHints(language: string | undefined): string[] | undefined {
  if (!language || language === "auto") return undefined;
  return [language];
}

function buildSonioxSessionConfig(opts: {
  apiKey: string;
  model: string;
  language?: string;
  bias?: TranscribeOptions["bias"];
  appContext?: string | null;
  translateTo?: string;
}): Record<string, unknown> {
  const config: Record<string, unknown> = {
    api_key: opts.apiKey,
    model: stripProviderPrefix(opts.model),
    audio_format: "pcm_s16le",
    sample_rate: 16000,
    num_channels: 1,
    enable_endpoint_detection: false,
  };
  const hints = languageHints(opts.language);
  if (opts.translateTo) {
    config.translation = { type: "one_way", target_language: opts.translateTo };
  } else if (hints) {
    config.language_hints = hints;
    config.language_hints_strict = true;
  }
  const context: Record<string, unknown> = {
    ...sonioxContextFromBias(opts.bias),
  };
  const general = sonioxGeneralFromAppContext(opts.appContext);
  if (general) context.general = general;
  if (Object.keys(context).length > 0) config.context = context;
  return config;
}

export class SonioxTranscriptionProvider implements TranscriptionProvider {
  readonly providerId = "soniox";

  async transcribe(opts: TranscribeOptions): Promise<TranscribeResult> {
    return new Promise((resolve, reject) => {
      const finalTokens: SonioxToken[] = [];
      let closed = false;

      const ws = new WebSocket(SONIOX_WS_URL);
      const config = buildSonioxSessionConfig(opts);

      const finish = (text: string) => {
        if (closed) return;
        closed = true;
        try {
          ws.close();
        } catch {}
        resolve({ text });
      };

      ws.on("open", () => {
        ws.send(JSON.stringify(config));
        ws.send(Buffer.from(opts.audio));
        ws.send(JSON.stringify({ type: "finalize" }));
        ws.send("");
      });

      ws.on("message", (raw) => {
        let msg: {
          tokens?: SonioxToken[];
          error_code?: number;
          error_message?: string;
          finished?: boolean;
        };
        try {
          msg = JSON.parse(raw.toString());
        } catch {
          return;
        }

        if (msg.error_code) {
          reject(
            new Error(msg.error_message ?? `Soniox error ${msg.error_code}`),
          );
          return;
        }

        const nonFinal: SonioxToken[] = [];
        for (const token of msg.tokens ?? []) {
          if (!token.text) continue;
          if (token.is_final) finalTokens.push(token);
          else nonFinal.push(token);
        }

        if (msg.finished) {
          finish(renderTokens(finalTokens, nonFinal).trim());
        }
      });

      ws.on("error", (err) => {
        if (!closed) reject(err);
      });

      setTimeout(() => {
        if (!closed) finish(renderTokens(finalTokens, []).trim());
      }, COMMIT_TIMEOUT_MS);
    });
  }

  supportsStreaming(_modelId: string): boolean {
    return true;
  }

  openStreamingSession(opts: StreamingSessionOptions): StreamSession {
    const { apiKey, model, language, translate, bias, appContext, callbacks } =
      opts;
    const short = stripProviderPrefix(model);
    const translateTo = translate && language ? language : undefined;

    const finalTokens: SonioxToken[] = [];
    let nonFinalTokens: SonioxToken[] = [];
    const sourceFinalTokens: SonioxToken[] = [];
    let sourceNonFinalTokens: SonioxToken[] = [];
    let finSeen = false;
    let commitRequested = false;
    let finalDelivered = false;
    let finalizeSent = false;
    let commitTimeout: ReturnType<typeof setTimeout> | null = null;
    let keepAlive: ReturnType<typeof setInterval> | null = null;
    let configured = false;
    let pendingChunks: ArrayBuffer[] = [];

    const ws = new WebSocket(SONIOX_WS_URL);

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

    function sendConfig(): void {
      const config = buildSonioxSessionConfig({
        apiKey,
        model,
        language,
        bias,
        appContext,
        translateTo,
      });
      ws.send(JSON.stringify(config));
      configured = true;
    }

    function flushPendingChunks(): void {
      for (const chunk of pendingChunks) {
        ws.send(Buffer.from(chunk));
      }
      pendingChunks = [];
    }

    function sendFinalize(): void {
      if (finalizeSent) return;
      finalizeSent = true;
      ws.send(JSON.stringify({ type: "finalize" }));
      ws.send("");
    }

    function deliverFinal(): void {
      if (finalDelivered) return;
      finalDelivered = true;
      commitRequested = false;
      finalizeSent = false;
      clearCommitTimeout();

      const text = renderTokens(finalTokens, nonFinalTokens).trim();
      finalTokens.length = 0;
      nonFinalTokens = [];
      sourceFinalTokens.length = 0;
      sourceNonFinalTokens = [];
      finSeen = false;
      callbacks.onFinal(text);
    }

    function maybeDeliverAfterFinalize(): void {
      if (!commitRequested || !finalizeSent || finalDelivered) return;
      if (translateTo && !finSeen) return;
      if (nonFinalTokens.length > 0) return;
      deliverFinal();
    }

    function handleTokens(tokens: SonioxToken[]): void {
      nonFinalTokens = [];
      sourceNonFinalTokens = [];
      for (const token of tokens) {
        if (!token.text) continue;
        if (token.text.includes(FIN_TOKEN)) finSeen = true;
        if (translateTo && token.translation_status === "original") {
          if (token.is_final) sourceFinalTokens.push(token);
          else sourceNonFinalTokens.push(token);
          continue;
        }
        if (token.is_final) finalTokens.push(token);
        else nonFinalTokens.push(token);
      }

      if (!commitRequested) {
        const hasSource =
          sourceFinalTokens.length > 0 || sourceNonFinalTokens.length > 0;
        const partial =
          translateTo && hasSource
            ? renderTokens(sourceFinalTokens, sourceNonFinalTokens).trim()
            : renderTokens(finalTokens, nonFinalTokens).trim();
        if (partial) callbacks.onPartial(partial);
      }

      maybeDeliverAfterFinalize();
    }

    ws.on("open", () => {
      sendConfig();
      flushPendingChunks();
      if (commitRequested) {
        sendFinalize();
      }
      keepAlive = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "keepalive" }));
        }
      }, KEEPALIVE_INTERVAL_MS);
      callbacks.onReady(short);
    });

    ws.on("message", (raw) => {
      let msg: {
        tokens?: SonioxToken[];
        error_code?: number;
        error_message?: string;
        finished?: boolean;
      };
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }

      if (msg.error_code) {
        callbacks.onError(
          msg.error_message ?? `Soniox error ${msg.error_code}`,
        );
        return;
      }

      if (msg.tokens) handleTokens(msg.tokens);

      if (msg.finished && commitRequested) {
        deliverFinal();
      }
    });

    ws.on("error", (err) => {
      stopKeepAlive();
      callbacks.onError(err instanceof Error ? err.message : String(err));
    });

    ws.on("close", () => {
      stopKeepAlive();
      if (commitRequested && !finalDelivered) {
        deliverFinal();
      }
      callbacks.onClose();
    });

    return {
      sendAudio(chunk: ArrayBuffer): void {
        if (finalizeSent || finalDelivered) return;
        if (ws.readyState === WebSocket.CONNECTING) {
          if (pendingChunks.length < MAX_PENDING_CHUNKS) {
            pendingChunks.push(chunk);
          }
          return;
        }
        if (ws.readyState !== WebSocket.OPEN || !configured) return;
        ws.send(Buffer.from(chunk));
      },
      reset(): void {
        clearCommitTimeout();
        pendingChunks = [];
        finalTokens.length = 0;
        nonFinalTokens = [];
        sourceFinalTokens.length = 0;
        sourceNonFinalTokens = [];
        finSeen = false;
        commitRequested = false;
        finalDelivered = false;
        finalizeSent = false;
      },
      commit(): void {
        commitRequested = true;
        clearCommitTimeout();
        commitTimeout = setTimeout(() => {
          deliverFinal();
        }, COMMIT_TIMEOUT_MS);

        if (ws.readyState === WebSocket.CONNECTING) return;
        if (ws.readyState !== WebSocket.OPEN) {
          deliverFinal();
          return;
        }
        sendFinalize();
      },
      cancel(): void {
        clearCommitTimeout();
        pendingChunks = [];
        finalTokens.length = 0;
        nonFinalTokens = [];
        sourceFinalTokens.length = 0;
        sourceNonFinalTokens = [];
        finSeen = false;
        commitRequested = false;
        finalDelivered = false;
        finalizeSent = false;
      },
      close(): void {
        clearCommitTimeout();
        stopKeepAlive();
        if (ws.readyState <= WebSocket.OPEN) ws.close();
      },
    };
  }
}
