import { createAppLogger } from "@freestyle/utils";
import { upgradeWebSocket } from "@hono/node-server";
import { Hono } from "hono";
import { getDb } from "../lib/db.js";
import { postProcess } from "../lib/post-process.js";
import { capture, captureException } from "../lib/posthog.js";
import { getDefaultModels } from "../lib/providers.js";
import { stripProviderPrefix } from "../lib/streaming/types.js";
import {
  getApiKeyForProvider,
  openStreamingSession,
  type StreamSession,
  supportsStreaming,
} from "../lib/streaming-stt.js";
import { resolveAsrVocabularyBias } from "../lib/vocabulary-bias.js";

const log = createAppLogger("stream");
const LOG_STREAM_PARTIALS = process.env.FREESTYLE_LOG_STREAM_PARTIALS === "1";

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
    let pendingCommit = false;
    let reconnectAttempts = 0;
    let readyToken = 0;
    let notifiedReadyToken = 0;
    const MAX_RECONNECT_ATTEMPTS = 3;

    function flushPendingAudio(): void {
      if (!upstream) return;
      for (const chunk of pendingAudioChunks) {
        upstream.sendAudio(chunk);
      }
      pendingAudioChunks = [];
    }

    function notifySessionReady(
      ws: { send: (data: string) => void },
      model: string,
      token: number,
    ): void {
      if (token !== readyToken || notifiedReadyToken === token) return;
      notifiedReadyToken = token;
      flushPendingAudio();
      ws.send(JSON.stringify({ type: "session.ready", model }));
      if (pendingCommit) {
        pendingCommit = false;
        upstream?.commit();
      }
    }

    function afterSessionReady(
      ws: { send: (data: string) => void },
      session: StreamSession,
      model: string,
      token: number,
    ): void {
      const ready = session.waitUntilReady?.();
      if (!ready) return;
      void ready
        .then(() => {
          if (closed || upstream !== session) return;
          notifySessionReady(ws, model, token);
        })
        .catch((err: Error) => {
          if (closed) return;
          ws.send(
            JSON.stringify({
              type: "error",
              message: err.message,
            }),
          );
        });
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
        readyToken++;
        notifiedReadyToken = readyToken;
        ws.send(JSON.stringify({ type: "session.ready", model: modelShort }));
        return;
      }

      const bias = resolveAsrVocabularyBias(
        defaults.voice.provider,
        defaults.voice.model_id,
        true,
      );

      const langSetting = getDb()
        .prepare("SELECT value FROM settings WHERE key = 'language'")
        .get() as { value: string } | undefined;
      const language = langSetting?.value || undefined;

      const token = ++readyToken;
      const session = openStreamingSession({
        providerId: defaults.voice.provider,
        apiKey,
        model: defaults.voice.model_id,
        language,
        bias,
        callbacks: {
          onReady: (readyModel) => {
            if (upstream !== session) return;
            reconnectAttempts = 0;
            notifySessionReady(ws, readyModel || modelShort, token);
          },
          onPartial: (text) => {
            if (upstream !== session) return;
            if (LOG_STREAM_PARTIALS) {
              log.info(
                `partial ${defaults.voice!.provider}/${modelShort}: ${text}`,
              );
            }
            ws.send(JSON.stringify({ type: "partial", text }));
          },
          onFinal: (rawText) => {
            if (upstream !== session) return;
            const durationMs = Date.now() - sessionStartTime;

            if (!rawText?.trim()) {
              ws.send(JSON.stringify({ type: "final", text: "" }));
              return;
            }

            postProcess(rawText, appContext, "streaming")
              .then((pp) => {
                capture("streaming transcription completed", {
                  provider: voiceDefaults!.provider,
                  model: voiceDefaults!.model_id,
                  duration_ms: durationMs,
                  audio_duration_ms: audioDurationMs,
                  llm_provider: pp.llmProvider,
                  llm_model: pp.llmModel,
                  input_tokens: pp.inputTokens,
                  output_tokens: pp.outputTokens,
                  cost_usd: pp.costUsd,
                });
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
                  log.error(`Failed to save history: ${err}`);
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
      if (canStream) {
        afterSessionReady(ws, session, modelShort, token);
      }
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
          if (
            !upstream ||
            (!upstream.waitUntilReady && notifiedReadyToken !== readyToken)
          ) {
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
          context?: string | null;
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
            appContext = msg.context ?? null;
            pendingAudioChunks = [];
            pendingCommit = false;
            reconnectAttempts = 0;
            if (upstream) {
              if (upstream.reset) {
                upstream.reset();
                const voice = voiceDefaults ?? getDefaultModels().voice;
                if (voice) {
                  const token = ++readyToken;
                  if (upstream.waitUntilReady) {
                    afterSessionReady(
                      ws,
                      upstream,
                      stripProviderPrefix(voice.model_id),
                      token,
                    );
                  } else {
                    notifySessionReady(
                      ws,
                      stripProviderPrefix(voice.model_id),
                      token,
                    );
                  }
                }
              } else {
                upstream.close();
                upstream = null;
                if (!streamingUnsupported) {
                  try {
                    connectUpstream(ws);
                  } catch {}
                }
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
            if (msg.context !== undefined) {
              appContext = msg.context;
            }
            if (
              upstream &&
              (upstream.waitUntilReady || notifiedReadyToken === readyToken)
            ) {
              upstream.commit();
            } else {
              pendingCommit = true;
            }
            break;
          case "cancel":
            pendingCommit = false;
            pendingAudioChunks = [];
            upstream?.cancel();
            break;
        }
      },

      onClose() {
        closed = true;
        pendingAudioChunks = [];
        pendingCommit = false;
        try {
          upstream?.close();
        } catch {}
        upstream = null;
      },

      onError() {
        closed = true;
        pendingAudioChunks = [];
        pendingCommit = false;
        try {
          upstream?.close();
        } catch {}
        upstream = null;
      },
    };
  }),
);

export default stream;
