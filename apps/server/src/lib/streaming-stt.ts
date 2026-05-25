import { Buffer } from "node:buffer";
import WebSocket from "ws";
import { getDb } from "./db.js";

export interface StreamCallbacks {
  onReady: (model: string) => void;
  onPartial: (text: string) => void;
  onFinal: (text: string) => void;
  onError: (message: string) => void;
  onClose: () => void;
}

export interface StreamSession {
  sendAudio(chunk: ArrayBuffer): void;
  commit(): void;
  cancel(): void;
  close(): void;
}

const REALTIME_URL = "wss://api.openai.com/v1/realtime?intent=transcription";

/**
 * Opens a streaming transcription session via OpenAI's Realtime API.
 * Supports models like gpt-4o-transcribe, gpt-4o-mini-transcribe.
 */
export function openStreamingSession(opts: {
  apiKey: string;
  model: string;
  prompt?: string;
  callbacks: StreamCallbacks;
}): StreamSession {
  const { apiKey, model, prompt, callbacks } = opts;
  let partialText = "";
  let configured = false;

  const ws = new WebSocket(REALTIME_URL, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "OpenAI-Beta": "realtime=v1",
    },
  });

  ws.on("open", () => {
    const transcription: Record<string, unknown> = { model };
    if (prompt) transcription.prompt = prompt;

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
          callbacks.onReady(model);
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
      if (ws.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
    },
    cancel(): void {
      if (ws.readyState !== WebSocket.OPEN) return;
      // Clear the audio buffer without triggering a transcription
      ws.send(JSON.stringify({ type: "input_audio_buffer.clear" }));
      partialText = "";
    },
    close(): void {
      if (ws.readyState <= WebSocket.OPEN) ws.close();
    },
  };
}

/**
 * Check if a model supports realtime streaming transcription.
 * Only OpenAI's gpt-4o-transcribe variants support the Realtime API.
 * On Windows, WinKeyServer and Realtime API are unavailable so streaming is disabled.
 */
export function supportsStreaming(
  providerId: string,
  modelId: string,
): boolean {
  if (process.platform === "win32") return false;
  if (providerId !== "openai") return false;
  const short = modelId.includes("/") ? modelId.split("/").pop()! : modelId;
  return short.includes("transcribe");
}

/**
 * Get the API key for a provider from the DB.
 */
export function getApiKeyForProvider(providerId: string): string | null {
  const db = getDb();
  const row = db
    .prepare("SELECT key FROM api_keys WHERE provider = ?")
    .get(providerId) as { key: string } | undefined;
  return row?.key ?? null;
}
