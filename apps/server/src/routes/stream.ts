import { createAppLogger } from "@freestyle/utils";
import { upgradeWebSocket } from "@hono/node-server";
import { Hono } from "hono";
import { sanitizeTranscriptText } from "../lib/editor/model-hints.js";
import { FreestyleCloudAuthError } from "../lib/freestyle-cloud.js";
import { saveProcessedHistory, saveRawHistory } from "../lib/history-store.js";
import { getLanguageSetting } from "../lib/language.js";
import {
  FreestyleEventType,
  parseAppContext,
  plugins,
} from "../lib/plugins/index.js";
import { postProcess, prewarmPostProcess } from "../lib/post-process.js";
import { capture, captureException } from "../lib/posthog.js";
import { getDefaultModels } from "../lib/providers.js";
import { invalidateSession } from "../lib/sessions.js";
import { shouldKeepStreamingUpstreamAlive } from "../lib/streaming/session-policy.js";
import { stripProviderPrefix } from "../lib/streaming/types.js";
import {
  getApiKeyForProvider,
  openStreamingSession,
  type StreamSession,
  supportsSessionTransport,
  supportsStreaming,
  voiceProviderCategory,
} from "../lib/streaming-stt.js";
import { resolveAsrVocabularyBias } from "../lib/vocabulary-bias.js";

const log = createAppLogger("stream");
const LOG_STREAM_PARTIALS = process.env.FREESTYLE_LOG_STREAM_PARTIALS === "1";
const LOG_PIPELINE_LATENCY = process.env.FREESTYLE_LOG_PIPELINE_LATENCY !== "0";

const stream = new Hono().get(
  "/",
  upgradeWebSocket(() => {
    let upstream: StreamSession | null = null;
    let closed = false;
    let sessionTransportUnavailable = false;
    let sessionStartTime = Date.now();
    /** Set when the client sends `commit` — measures Soniox finalize tail only. */
    let commitTime = 0;
    let voiceDefaults: { provider: string; model_id: string } | null = null;
    /** Fingerprint of the settings the current upstream session was built with. */
    let upstreamConfigKey: string | null = null;
    let appContext: string | null = null;
    let audioDurationMs = 0;
    /** Audio received while the upstream socket is still connecting. */
    let pendingAudioChunks: ArrayBuffer[] = [];
    let pendingChunksDropped = false;
    let pendingCommit = false;
    let reconnectAttempts = 0;
    let readyToken = 0;
    let notifiedReadyToken = 0;
    const MAX_RECONNECT_ATTEMPTS = 3;
    const MAX_PENDING_AUDIO_CHUNKS = 500;
    type ResolvedStreamConfig = NonNullable<
      ReturnType<typeof resolveStreamConfig>
    >;
    type AnnouncedStreamConfig = {
      config: ResolvedStreamConfig;
      canStream: boolean;
      canUseSessionTransport: boolean;
      modelShort: string;
    };

    /** Resolve the settings a session transport depends on, plus a compare key. */
    function resolveStreamConfig(): {
      voice: { provider: string; model_id: string };
      language: string | undefined;
      bias: ReturnType<typeof resolveAsrVocabularyBias>;
      key: string;
    } | null {
      const voice = getDefaultModels().voice;
      if (!voice) return null;
      const language = getLanguageSetting();
      const bias = resolveAsrVocabularyBias(
        voice.provider,
        voice.model_id,
        true,
      );
      return {
        voice,
        language,
        bias,
        key: JSON.stringify([
          voice.provider,
          voice.model_id,
          language ?? null,
          bias,
        ]),
      };
    }

    function flushPendingAudio(): void {
      if (!upstream) return;
      for (const chunk of pendingAudioChunks) {
        upstream.sendAudio(chunk);
      }
      pendingAudioChunks = [];
    }

    function closeUpstreamSession(session: StreamSession | null): void {
      if (!session) return;
      if (upstream === session) {
        upstream = null;
        upstreamConfigKey = null;
      }
      try {
        session.close();
      } catch {}
    }

    function notifySessionReady(
      ws: { send: (data: string) => void },
      model: string,
      token: number,
    ): void {
      if (token !== readyToken || notifiedReadyToken === token) return;
      notifiedReadyToken = token;
      flushPendingAudio();
      if (voiceDefaults?.provider === "soniox") {
        prewarmPostProcess();
      }
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

    function announceConfig(ws: {
      send: (data: string) => void;
      close: () => void;
    }): AnnouncedStreamConfig | null {
      const config = resolveStreamConfig();
      if (!config) {
        ws.send(
          JSON.stringify({
            type: "error",
            message: "No voice model configured",
          }),
        );
        ws.close();
        return null;
      }
      const voice = config.voice;
      voiceDefaults = voice;

      const canStream = supportsStreaming(voice.provider, voice.model_id);
      const canUseSessionTransport = supportsSessionTransport(
        voice.provider,
        voice.model_id,
      );

      const modelShort = stripProviderPrefix(voice.model_id);

      ws.send(
        JSON.stringify({
          type: "config",
          model: modelShort,
          streaming: canStream,
          sessionTransport: canUseSessionTransport,
          providerCategory: voiceProviderCategory(voice.provider),
        }),
      );

      return {
        config,
        canStream,
        canUseSessionTransport,
        modelShort,
      };
    }

    function connectUpstream(
      ws: {
        send: (data: string) => void;
        close: () => void;
      },
      announced?: AnnouncedStreamConfig,
    ): void {
      const resolved = announced ?? announceConfig(ws);
      if (!resolved) return;

      const { config, canStream, canUseSessionTransport, modelShort } =
        resolved;
      const voice = config.voice;

      const apiKey = getApiKeyForProvider(voice.provider);
      if (!apiKey) {
        ws.send(
          JSON.stringify({
            type: "error",
            message: `No API key for ${voice.provider}`,
          }),
        );
        ws.close();
        return;
      }

      if (!canUseSessionTransport) {
        readyToken++;
        notifiedReadyToken = readyToken;
        ws.send(JSON.stringify({ type: "session.ready", model: modelShort }));
        return;
      }

      upstreamConfigKey = config.key;

      const token = ++readyToken;
      const session = openStreamingSession({
        providerId: voice.provider,
        apiKey,
        model: voice.model_id,
        language: config.language,
        bias: config.bias,
        callbacks: {
          onReady: (readyModel) => {
            if (upstream !== session) return;
            reconnectAttempts = 0;
            notifySessionReady(ws, readyModel || modelShort, token);
          },
          onPartial: (text) => {
            if (upstream !== session) return;
            if (LOG_STREAM_PARTIALS) {
              log.info(`partial ${voice.provider}/${modelShort}: ${text}`);
            }
            ws.send(JSON.stringify({ type: "partial", text }));
          },
          onFinal: async (rawText) => {
            if (upstream !== session) return;
            rawText = sanitizeTranscriptText(rawText);
            const durationMs = Date.now() - sessionStartTime;
            if (!shouldKeepStreamingUpstreamAlive(voice.provider)) {
              closeUpstreamSession(session);
            }

            // Plugin hook: rewrite the raw transcript before cleanup, matching
            // the batch /transcribe route so streaming dictations get the same
            // afterTranscribe + transcribed surfaces.
            rawText = (
              await plugins().run(
                "afterTranscribe",
                {
                  providerId: voiceDefaults!.provider,
                  modelId: voiceDefaults!.model_id,
                  appContext: parseAppContext(appContext),
                },
                { text: rawText },
              )
            ).text;

            if (!rawText?.trim()) {
              ws.send(JSON.stringify({ type: "final", text: "" }));
              return;
            }

            void plugins().emit({
              type: FreestyleEventType.Transcribed,
              text: rawText,
            });

            const useFastHandoff =
              canStream && voiceDefaults!.provider === "soniox";
            const sttAfterCommitMs =
              commitTime > 0 ? Date.now() - commitTime : durationMs;

            const cleanup = postProcess(rawText, appContext, {
              language: config.language,
              source: useFastHandoff
                ? "streaming_handoff"
                : canStream
                  ? "streaming"
                  : "batch",
              ...(useFastHandoff ? { includeTimings: true } : {}),
            });

            cleanup
              .then((pp) => {
                if (LOG_PIPELINE_LATENCY) {
                  const handoffTimings = pp.timings;
                  if (handoffTimings) {
                    const { handoffMs, llmMs } = handoffTimings;
                    const e2eMs = sttAfterCommitMs + handoffMs + llmMs;
                    log.info(
                      `[pipeline] stt=${sttAfterCommitMs}ms handoff=${handoffMs}ms llm=${llmMs}ms e2e=${e2eMs}ms | ${voiceDefaults!.provider}/${voiceDefaults!.model_id} → ${pp.llmModel ?? "—"}`,
                    );
                  } else {
                    log.info(
                      `[pipeline] session=${durationMs}ms stt_after_commit=${sttAfterCommitMs}ms | ${voiceDefaults!.provider}/${voiceDefaults!.model_id}`,
                    );
                  }
                }
                capture("streaming transcription completed", {
                  provider: voiceDefaults!.provider,
                  provider_category: voiceProviderCategory(
                    voiceDefaults!.provider,
                  ),
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
                  saveProcessedHistory({
                    rawText,
                    cleanedText: pp.cleaned !== rawText ? pp.cleaned : null,
                    voiceProvider: voiceDefaults!.provider,
                    voiceModel: voiceDefaults!.model_id,
                    llmProvider: pp.llmProvider,
                    llmModel: pp.llmModel,
                    durationMs,
                    audioDurationMs,
                    inputTokens: pp.inputTokens,
                    outputTokens: pp.outputTokens,
                    costUsd: pp.costUsd,
                  });
                } catch (err) {
                  log.error(`Failed to save history: ${err}`);
                }
              })
              .catch((err) => {
                if (err instanceof FreestyleCloudAuthError) {
                  invalidateSession();
                  if (!closed) {
                    ws.send(
                      JSON.stringify({
                        type: "error",
                        code: "cloud_auth_required",
                        message: "Sign in to Freestyle Cloud",
                      }),
                    );
                  }
                  return;
                }
                captureException(err);
                if (!closed) {
                  ws.send(JSON.stringify({ type: "final", text: rawText }));
                }
                try {
                  saveRawHistory({
                    rawText,
                    voiceProvider: voiceDefaults!.provider,
                    voiceModel: voiceDefaults!.model_id,
                    durationMs,
                    audioDurationMs,
                  });
                } catch {}
              });
          },
          onError: (message) => {
            if (upstream !== session) return;
            sessionTransportUnavailable = true;
            ws.send(
              JSON.stringify({
                type: "config",
                streaming: false,
                sessionTransport: false,
                model: modelShort,
              }),
            );
            ws.send(JSON.stringify({ type: "error", message }));
            upstream = null;
            try {
              session.close();
            } catch {}
          },
          onClose: () => {
            // Ignore close from a superseded socket (replaced on a later "start").
            if (upstream !== session) return;
            upstream = null;
            if (
              !closed &&
              !sessionTransportUnavailable &&
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
      if (canUseSessionTransport) {
        afterSessionReady(ws, session, modelShort, token);
      }
    }

    return {
      onOpen(_event, ws) {
        try {
          const announced = announceConfig(ws);
          if (!announced) return;
          if (!announced.canUseSessionTransport) {
            readyToken++;
            notifiedReadyToken = readyToken;
            ws.send(
              JSON.stringify({
                type: "session.ready",
                model: announced.modelShort,
              }),
            );
            return;
          }
          if (
            !shouldKeepStreamingUpstreamAlive(announced.config.voice.provider)
          ) {
            return;
          }
          connectUpstream(ws, announced);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          ws.send(JSON.stringify({ type: "error", message }));
          ws.close();
        }
      },

      onMessage(event, ws) {
        const data = event.data;
        // Note: Buffer is an ArrayBuffer view, so this covers Node Buffers too.
        if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) {
          const buf =
            data instanceof ArrayBuffer
              ? data
              : (data.buffer.slice(
                  data.byteOffset,
                  data.byteOffset + data.byteLength,
                ) as ArrayBuffer);
          if (
            !upstream ||
            (!upstream.waitUntilReady && notifiedReadyToken !== readyToken)
          ) {
            if (pendingAudioChunks.length < MAX_PENDING_AUDIO_CHUNKS) {
              pendingAudioChunks.push(buf);
            } else if (!pendingChunksDropped) {
              // Tell the client so it can fall back to the recorded WAV
              // instead of silently losing audio.
              pendingChunksDropped = true;
              ws.send(
                JSON.stringify({
                  type: "error",
                  message: "Streaming session stalled; audio buffer overflow",
                }),
              );
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
          case "start": {
            sessionStartTime = Date.now();
            audioDurationMs = 0;
            appContext = msg.context ?? null;
            pendingAudioChunks = [];
            pendingChunksDropped = false;
            pendingCommit = false;
            reconnectAttempts = 0;
            // A prior upstream error disables session transport only for the
            // rest of that recording; each new recording gets a fresh attempt.
            sessionTransportUnavailable = false;
            // Reuse the session only if the settings it was built with
            // (provider, model, language, vocabulary bias) are unchanged.
            const nextConfig = resolveStreamConfig();
            const sameConfig =
              upstreamConfigKey !== null &&
              nextConfig?.key === upstreamConfigKey;
            const keepWarm =
              nextConfig !== null &&
              shouldKeepStreamingUpstreamAlive(nextConfig.voice.provider);
            if (upstream?.reset && sameConfig && keepWarm) {
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
              break;
            }
            if (upstream) {
              closeUpstreamSession(upstream);
            }
            try {
              connectUpstream(ws);
            } catch {}
            break;
          }
          case "commit":
            commitTime = Date.now();
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
            if (
              upstream &&
              voiceDefaults &&
              !shouldKeepStreamingUpstreamAlive(voiceDefaults.provider)
            ) {
              closeUpstreamSession(upstream);
            } else {
              upstream?.cancel();
            }
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
