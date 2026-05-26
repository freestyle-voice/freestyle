import { upgradeWebSocket } from "@hono/node-server";
import { Hono } from "hono";
import { getDb } from "../lib/db.js";
import { postProcess } from "../lib/post-process.js";
import { getDefaultModels } from "../lib/providers.js";
import {
  getApiKeyForProvider,
  openStreamingSession,
  type StreamSession,
  supportsStreaming,
} from "../lib/streaming-stt.js";

const stream = new Hono().get(
  "/",
  upgradeWebSocket(() => {
    let upstream: StreamSession | null = null;
    let closed = false;
    let sessionStartTime = Date.now();
    let voiceDefaults: { provider: string; model_id: string } | null = null;
    let appContext: string | null = null;
    let audioDurationMs = 0;

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

      const modelShort = defaults.voice.model_id.includes("/")
        ? defaults.voice.model_id.split("/").pop()!
        : defaults.voice.model_id;

      const canStream = supportsStreaming(
        defaults.voice.provider,
        defaults.voice.model_id,
      );

      ws.send(
        JSON.stringify({
          type: "config",
          model: modelShort,
          streaming: canStream,
        }),
      );

      if (!canStream) {
        ws.close();
        return;
      }

      let prompt: string | undefined;
      try {
        const db = getDb();
        const row = db
          .prepare(
            "SELECT value FROM settings WHERE key = 'transcription_prompt'",
          )
          .get() as { value: string } | undefined;
        if (row?.value) prompt = row.value;
      } catch {}

      upstream = openStreamingSession({
        apiKey,
        model: modelShort,
        prompt,
        callbacks: {
          onReady: (model) => {
            ws.send(JSON.stringify({ type: "session.ready", model }));
          },
          onPartial: (text) => {
            ws.send(JSON.stringify({ type: "partial", text }));
          },
          onFinal: (rawText) => {
            const durationMs = Date.now() - sessionStartTime;

            // Send raw text immediately so the client can paste without waiting
            ws.send(JSON.stringify({ type: "final", text: rawText }));

            // Run post-processing in the background for history
            postProcess(rawText, appContext)
              .then((pp) => {
                const finalText = pp.cleaned;
                if (finalText !== rawText && !closed) {
                  ws.send(JSON.stringify({ type: "cleaned", text: finalText }));
                }
                try {
                  const db = getDb();
                  db.prepare(
                    `INSERT INTO transcription_history
                       (raw_text, cleaned_text, voice_provider, voice_model, llm_provider, llm_model, duration_ms, audio_duration_ms, input_tokens, output_tokens, cost_usd)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                  ).run(
                    rawText,
                    finalText !== rawText ? finalText : null,
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
                console.error("Post-processing failed:", err);
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
            ws.send(JSON.stringify({ type: "error", message }));
            upstream = null;
          },
          onClose: () => {
            upstream = null;
            if (!closed) {
              try {
                connectUpstream(ws);
              } catch {}
            }
          },
        },
      });
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
        // Binary data = audio chunk
        if (event.data instanceof ArrayBuffer) {
          upstream?.sendAudio(event.data);
          return;
        }

        // Text data = JSON command
        let msg: { type: string; context?: string; audioDurationMs?: number };
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
            if (!upstream) {
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
        try {
          upstream?.close();
        } catch {}
        upstream = null;
      },

      onError() {
        closed = true;
        try {
          upstream?.close();
        } catch {}
        upstream = null;
      },
    };
  }),
);

export default stream;
