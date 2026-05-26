/**
 * Persistent WebSocket-based audio streamer for real-time STT.
 *
 * A single Streamer instance stays alive across recording sessions.
 * The WebSocket to the server (and through it the OpenAI Realtime
 * upstream) remains open, eliminating reconnection overhead on each
 * hotkey press.  Recording sessions are delimited by startCapture /
 * commit / cancel rather than connect / disconnect.
 */

import { getPCMProcessorUrl } from "./pcm-processor";
import { encodeWavFromInt16 } from "./wav";

const TARGET_RATE = 16000;

export interface StreamerCallbacks {
  onPartial: (text: string) => void;
  onFinal: (text: string) => void;
  onCleaned?: (text: string) => void;
  onError: (message: string) => void;
  onReady: () => void;
  onConfig: (config: { streaming: boolean; model: string }) => void;
}

export class Streamer {
  private ws: WebSocket | null = null;
  private sessionReady = false;
  private pendingChunks: ArrayBuffer[] = [];
  private destroyed = false;
  private readonly callbacks: StreamerCallbacks;
  private readonly wsUrl: string;

  // Capture pipeline — reused across sessions when possible
  private ctx: AudioContext | null = null;
  private workletReady = false;
  private source: MediaStreamAudioSourceNode | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private capturing = false;

  // PCM accumulator for REST fallback WAV generation
  private pcmChunks: Int16Array[] = [];
  private pcmSampleCount = 0;

  constructor(baseUrl: string, callbacks: StreamerCallbacks) {
    this.wsUrl = `${baseUrl.replace(/^http/, "ws")}/stream`;
    this.callbacks = callbacks;
    this.openWebSocket();
  }

  // ------- public API -------

  setContext(context: string): void {
    this.sendJSON({ type: "context", context });
  }

  async startCapture(
    stream: MediaStream,
    sharedCtx?: AudioContext,
  ): Promise<void> {
    this.capturing = true;
    this.pendingChunks = [];
    this.pcmChunks = [];
    this.pcmSampleCount = 0;
    this.sendJSON({ type: "start" });

    // Adopt the shared AudioContext when provided and still open.
    if (sharedCtx && sharedCtx.state !== "closed") {
      if (this.ctx && this.ctx !== sharedCtx) {
        try {
          this.ctx.close();
        } catch {}
        this.workletReady = false;
        this.workletNode = null;
      }
      this.ctx = sharedCtx;
    }
    if (!this.ctx || this.ctx.state === "closed") {
      this.ctx = new AudioContext();
      this.workletReady = false;
      this.workletNode = null;
    }
    if (this.ctx.state === "suspended") await this.ctx.resume();

    if (!this.workletReady) {
      await this.ctx.audioWorklet.addModule(getPCMProcessorUrl());
      this.workletReady = true;
    }

    // Disconnect previous source if leftover from a prior session.
    try {
      this.source?.disconnect();
    } catch {}

    this.source = this.ctx.createMediaStreamSource(stream);

    // Reuse the existing worklet node when the AudioContext hasn't changed.
    if (!this.workletNode) {
      this.workletNode = new AudioWorkletNode(this.ctx, "pcm-processor");
      this.workletNode.connect(this.ctx.destination);
    }

    this.workletNode.port.onmessage = (e: MessageEvent) => {
      if (!this.capturing) return;
      const chunk = e.data as ArrayBuffer;
      this.sendAudio(chunk);

      // Accumulate for REST fallback
      const pcm16 = new Int16Array(chunk);
      this.pcmChunks.push(pcm16);
      this.pcmSampleCount += pcm16.length;
    };
    this.source.connect(this.workletNode);
  }

  commit(): void {
    const audioDurationMs = Math.round(
      (this.pcmSampleCount / TARGET_RATE) * 1000,
    );
    this.stopCapture();
    this.sendJSON({ type: "commit", audioDurationMs });
  }

  cancel(): void {
    this.stopCapture();
    this.sendJSON({ type: "cancel" });
  }

  getWavBlob(): Blob | null {
    if (this.pcmSampleCount === 0) return null;
    const blob = encodeWavFromInt16(
      this.pcmChunks,
      this.pcmSampleCount,
      TARGET_RATE,
    );
    this.pcmChunks = [];
    this.pcmSampleCount = 0;
    return blob;
  }

  destroy(): void {
    this.destroyed = true;
    this.stopCapture();
    this.workletNode = null;
    if (this.ws && this.ws.readyState <= WebSocket.OPEN) this.ws.close();
    this.ws = null;
    if (this.ctx) {
      try {
        this.ctx.close();
      } catch {}
      this.ctx = null;
      this.workletReady = false;
    }
  }

  // ------- internals -------

  /** Disconnect the source to stop audio flow, but keep the worklet alive. */
  private stopCapture(): void {
    this.capturing = false;
    try {
      this.source?.disconnect();
    } catch {}
    this.source = null;
  }

  private sendAudio(chunk: ArrayBuffer): void {
    if (this.ws?.readyState === WebSocket.OPEN && this.sessionReady) {
      this.ws.send(chunk);
    } else {
      this.pendingChunks.push(chunk);
    }
  }

  private sendJSON(obj: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(obj));
    }
  }

  private flushPendingChunks(): void {
    if (!this.sessionReady || this.ws?.readyState !== WebSocket.OPEN) return;
    for (const chunk of this.pendingChunks) {
      this.ws!.send(chunk);
    }
    this.pendingChunks = [];
  }

  private openWebSocket(): void {
    if (this.destroyed) return;
    const ws = new WebSocket(this.wsUrl);
    ws.binaryType = "arraybuffer";
    this.ws = ws;

    ws.addEventListener("message", (e) => {
      if (typeof e.data !== "string") return;
      let msg: {
        type: string;
        text?: string;
        message?: string;
        model?: string;
        streaming?: boolean;
      };
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }
      switch (msg.type) {
        case "config":
          this.callbacks.onConfig({
            streaming: msg.streaming ?? false,
            model: msg.model ?? "",
          });
          break;
        case "session.ready":
          this.sessionReady = true;
          this.flushPendingChunks();
          this.callbacks.onReady();
          break;
        case "partial":
          this.callbacks.onPartial(msg.text ?? "");
          break;
        case "final":
          this.callbacks.onFinal(msg.text ?? "");
          break;
        case "cleaned":
          this.callbacks.onCleaned?.(msg.text ?? "");
          break;
        case "error":
          this.callbacks.onError(msg.message ?? "Unknown error");
          break;
      }
    });

    ws.addEventListener("error", () => {});

    ws.addEventListener("close", () => {
      this.sessionReady = false;
      this.pendingChunks = [];
      if (!this.destroyed) {
        setTimeout(() => {
          if (!this.destroyed) this.openWebSocket();
        }, 1000);
      }
    });
  }
}
