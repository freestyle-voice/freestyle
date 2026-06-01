import { upgradeWebSocket } from "@hono/node-server";
import { Hono } from "hono";
import { getDb } from "../lib/db.js";
import { postProcess } from "../lib/post-process.js";
import { getDefaultModels } from "../lib/providers.js";
import { captureException, metrics } from "../lib/sentry.js";
import { stripProviderPrefix } from "../lib/streaming/types.js";
import {
  getApiKeyForProvider,
  openStreamingSession,
  type StreamSession,
  supportsStreaming,
} from "../lib/streaming-stt.js";
import { resolveAsrVocabularyBias } from "../lib/vocabulary-bias.js";

const stream = new Hono().get(
  "/",
  upgradeWebSocket(() => {
    let upstream: StreamSession | null = null;
    let closed = false;
    let streamingUnsupported = false;
    let sessionStartTime = Date.now();
    let voiceDefaults: { provider: string; model_id: string } | null = null;
    let appContext: string | null = null;
    let audioDurationMs = 0;
    /** Audio received while the upstream socket is still connecting. */
    let pendingAudioChunks: ArrayBuffer[] = [];
    let reconnectAttempts = 0;
    const MAX_RECONNECT_ATTEMPTS = 3;

    function flushPendingAudio(): void {
      if (!upstream) return;
      for (const chunk of pendingAudioChunks) {
        upstream.sendAudio(chunk);
      }
      pendingAudioChunks = [];
    }

    function connectUpstream(ws: {
      send: (data: string) => void;
      close: () => void;
    }): void {
      const defaults = getDefaultModels();
      if (!defaults.voice) {
        ws.send(
          JSON.stringify({
            type: "error",
            message: "No voice model configured",
          }),
        );
        ws.close();
        return;
      }
      voiceDefaults = defaults.voice;

      const apiKey = getApiKeyForProvider(defaults.voice.provider);
      if (!apiKey) {
        ws.send(
          JSON.stringify({
            type: "error",
            message: `No API key for ${defaults.voice.provider}`,
          }),
        );
        ws.close();
        return;
      }

      const canStream = supportsStreaming(
        defaults.voice.provider,
        defaults.voice.model_id,
      );

      const modelShort = stripProviderPrefix(defaults.voice.model_id);

      ws.send(
        JSON.stringify({
          type: "config",
          model: modelShort,
          streaming: canStream,
        }),
      );

      if (!canStream) {
        ws.send(JSON.stringify({ type: "session.ready", model: modelShort }));
        return;
      }

      const bias = resolveAsrVocabularyBias(
        defaults.voice.provider,
        defaults.voice.model_id,
        true,
      );

      metrics.count("streaming.session_opened", 1, {
        attributes: { provider: defaults.voice.provider },
      });

      const session = openStreamingSession({
        providerId: defaults.voice.provider,
        apiKey,
        model: defaults.voice.model_id,
        bias,
        callbacks: {
          onReady: (model) => {
            if (upstream !== session) return;
            reconnectAttempts = 0;
            flushPendingAudio();
            ws.send(JSON.stringify({ type: "session.ready", model }));
          },
          onPartial: (text) => {
            if (upstream !== session) return;
            ws.send(JSON.stringify({ type: "partial", text }));
          },
          onFinal: (rawText) => {
            if (upstream !== session) return;
            const durationMs = Date.now() - sessionStartTime;

            const streamTags = {
              provider: voiceDefaults!.provider,
              model: voiceDefaults!.model_id,
            };
            metrics.count("streaming.transcription_count", 1, {
              attributes: streamTags,
            });
            metrics.distribution("streaming.latency", durationMs, {
              unit: "millisecond",
              attributes: streamTags,
            });
            if (audioDurationMs > 0) {
              metrics.distribution(
                "streaming.audio_duration",
                audioDurationMs,
                { unit: "millisecond", attributes: streamTags },
              );
            }

            if (!rawText?.trim()) {
              ws.send(JSON.stringify({ type: "final", text: "" }));
              return;
            }

            postProcess(rawText, appContext)
              .then((pp) => {
                if (!closed) {
                  ws.send(JSON.stringify({ type: "final", text: pp.cleaned }));
                }
                try {
                  const db = getDb();
                  db.prepare(
                    `INSERT INTO transcription_history
                       (raw_text, cleaned_text, voice_provider, voice_model, llm_provider, llm_model, duration_ms, audio_duration_ms, input_tokens, output_tokens, cost_usd)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                  ).run(
                    rawText,
                    pp.cleaned !== rawText ? pp.cleaned : null,
                    voiceDefaults!.provider,
                    voiceDefaults!.model_id,
                    pp.llmProvider,
                    pp.llmModel,
                    durationMs,
                    audioDurationMs,
                    pp.inputTokens,
                    pp.outputTokens,
                    pp.costUsd,
                  );
                } catch (err) {
                  console.error("Failed to save history:", err);
                }
              })
              .catch((err) => {
                captureException(err);
                if (!closed) {
                  ws.send(JSON.stringify({ type: "final", text: rawText }));
                }
                try {
                  const db = getDb();
                  db.prepare(
                    `INSERT INTO transcription_history
                       (raw_text, voice_provider, voice_model, duration_ms, audio_duration_ms)
                       VALUES (?, ?, ?, ?, ?)`,
                  ).run(
                    rawText,
                    voiceDefaults!.provider,
                    voiceDefaults!.model_id,
                    durationMs,
                    audioDurationMs,
                  );
                } catch {}
              });
          },
          onError: (message) => {
            if (upstream !== session) return;
            streamingUnsupported = true;
            ws.send(
              JSON.stringify({
                type: "config",
                streaming: false,
                model: stripProviderPrefix(defaults.voice!.model_id),
              }),
            );
            ws.send(JSON.stringify({ type: "error", message }));
            upstream = null;
          },
          onClose: () => {
            // Ignore close from a superseded socket (replaced on a later "start").
            if (upstream !== session) return;
            upstream = null;
            if (
              !closed &&
              !streamingUnsupported &&
              reconnectAttempts < MAX_RECONNECT_ATTEMPTS
            ) {
              reconnectAttempts++;
              try {
                connectUpstream(ws);
              } catch {}
            }
          },
        },
      });
      upstream = session;
    }

    return {
      onOpen(_event, ws) {
        try {
          connectUpstream(ws);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          ws.send(JSON.stringify({ type: "error", message }));
          ws.close();
        }
      },

      onMessage(event, ws) {
        const data = event.data;
        const isBinary =
          data instanceof ArrayBuffer ||
          ArrayBuffer.isView(data) ||
          (typeof Buffer !== "undefined" && Buffer.isBuffer(data));
        if (isBinary) {
          const buf =
            data instanceof ArrayBuffer
              ? data
              : ArrayBuffer.isView(data)
                ? (data.buffer.slice(
                    data.byteOffset,
                    data.byteOffset + data.byteLength,
                  ) as ArrayBuffer)
                : ((data as Buffer).buffer.slice(
                    (data as Buffer).byteOffset,
                    (data as Buffer).byteOffset + (data as Buffer).byteLength,
                  ) as ArrayBuffer);
          if (!upstream) {
            if (pendingAudioChunks.length < 500) {
              pendingAudioChunks.push(buf);
            }
            return;
          }
          upstream.sendAudio(buf);
          return;
        }

        let msg: {
          type: string;
          context?: string;
          audioDurationMs?: number;
        };
        try {
          msg = JSON.parse(
            typeof event.data === "string"
              ? event.data
              : new TextDecoder().decode(event.data as unknown as ArrayBuffer),
          );
        } catch {
          return;
        }

        switch (msg.type) {
          case "context":
            appContext = msg.context ?? null;
            break;
          case "start":
            sessionStartTime = Date.now();
            audioDurationMs = 0;
            appContext = null;
            pendingAudioChunks = [];
            reconnectAttempts = 0;
            if (upstream) {
              upstream.reset();
              flushPendingAudio();
              const voice = voiceDefaults ?? getDefaultModels().voice;
              if (voice) {
                ws.send(
                  JSON.stringify({
                    type: "session.ready",
                    model: stripProviderPrefix(voice.model_id),
                  }),
                );
              }
              break;
            }
            if (!streamingUnsupported) {
              try {
                connectUpstream(ws);
              } catch {}
            }
            break;
          case "commit":
            if (msg.audioDurationMs && msg.audioDurationMs > 0) {
              audioDurationMs = msg.audioDurationMs;
            }
            upstream?.commit();
            break;
          case "cancel":
            upstream?.cancel();
            break;
        }
      },

      onClose() {
        closed = true;
        pendingAudioChunks = [];
        try {
          upstream?.close();
        } catch {}
        upstream = null;
      },

      onError() {
        closed = true;
        pendingAudioChunks = [];
        try {
          upstream?.close();
        } catch {}
        upstream = null;
      },
    };
  }),
);

export default stream;
