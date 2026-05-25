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

const TARGET_RATE = 16000;

export interface StreamerCallbacks {
  onPartial: (text: string) => void;
  onFinal: (text: string) => void;
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

  constructor(baseUrl: string, callbacks: StreamerCallbacks) {
    this.wsUrl = `${baseUrl.replace(/^http/, "ws")}/stream`;
    this.callbacks = callbacks;
    this.openWebSocket();
  }

  // ------- public API -------

  setContext(context: string): void {
    this.sendJSON({ type: "context", context });
  }

  /**
   * Begin capturing audio from the given stream and feeding it to the
   * server.  The stream is typically the one already acquired by the
   * Recorder so no extra getUserMedia call is needed.
   */
  async startCapture(
    stream: MediaStream,
    sharedCtx?: AudioContext,
  ): Promise<void> {
    this.capturing = true;
    this.pendingChunks = [];
    this.sendJSON({ type: "start" });

    if (sharedCtx && sharedCtx.state !== "closed") {
      if (this.ctx && this.ctx !== sharedCtx) {
        try {
          this.ctx.close();
        } catch {}
      }
      this.ctx = sharedCtx;
    }
    if (!this.ctx || this.ctx.state === "closed") {
      this.ctx = new AudioContext();
    }
    if (this.ctx.state === "suspended") await this.ctx.resume();

    if (!this.workletReady) {
      await this.ctx.audioWorklet.addModule(getPCMProcessorUrl());
      this.workletReady = true;
    }

    this.source = this.ctx.createMediaStreamSource(stream);
    this.workletNode = new AudioWorkletNode(this.ctx, "pcm-processor");
    this.workletNode.port.onmessage = (e: MessageEvent) => {
      if (!this.capturing) return;
      const input = new Float32Array(e.data);
      const pcm16 = downsampleAndEncode(
        input,
        this.ctx!.sampleRate,
        TARGET_RATE,
      );
      this.sendAudio(pcm16.buffer as ArrayBuffer);
    };
    this.source.connect(this.workletNode);
    this.workletNode.connect(this.ctx.destination);
  }

  commit(): void {
    this.stopCapture();
    this.sendJSON({ type: "commit" });
  }

  cancel(): void {
    this.stopCapture();
    this.sendJSON({ type: "cancel" });
  }

  /** Tear down everything — only call on app unmount. */
  destroy(): void {
    this.destroyed = true;
    this.stopCapture();
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

  getAudioContext(): AudioContext | null {
    return this.ctx;
  }

  // ------- internals -------

  private stopCapture(): void {
    this.capturing = false;
    try {
      this.workletNode?.disconnect();
    } catch {}
    try {
      this.source?.disconnect();
    } catch {}
    this.workletNode = null;
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
          if (!msg.streaming) {
            this.destroy();
          }
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

/**
 * Downsample float32 audio to target rate and encode as PCM16.
 */
function downsampleAndEncode(
  input: Float32Array,
  fromRate: number,
  toRate: number,
): Int16Array {
  const ratio = fromRate / toRate;
  const outLength = Math.round(input.length / ratio);
  const output = new Int16Array(outLength);

  for (let i = 0; i < outLength; i++) {
    const srcIndex = Math.round(i * ratio);
    const sample = Math.max(-1, Math.min(1, input[srcIndex] ?? 0));
    output[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }

  return output;
}
