/**
 * Persistent WebSocket-based audio session transport for STT.
 *
 * A single Streamer instance stays alive across recording sessions.
 * The renderer↔server WebSocket remains open, while the server may keep
 * the upstream STT provider warm or reopen it per recording depending on
 * provider behavior. Some providers stream live partials; others use the
 * same session transport for a single final transcript on commit.
 * Recording sessions are delimited by startCapture / commit / cancel
 * rather than rebuilding the whole client pipeline.
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
  onConfig: (config: {
    streaming: boolean;
    sessionTransport: boolean;
    model: string;
    providerCategory?: string;
  }) => void;
}

export class Streamer {
  private ws: WebSocket | null = null;
  private pendingChunks: ArrayBuffer[] = [];
  private destroyed = false;
  private streamingSupported = false;
  private sessionTransportSupported = false;
  private configReceived = false;
  private readonly callbacks: StreamerCallbacks;
  private readonly wsUrl: string;
  private currentContext: string | null = null;

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

  setContext(context: string | null): void {
    this.currentContext = context;
    this.sendJSON({ type: "context", context });
  }

  async startCapture(stream: MediaStream): Promise<void> {
    if (!this.ws || this.ws.readyState > WebSocket.OPEN) {
      this.openWebSocket();
    }
    this.capturing = true;
    this.pendingChunks = [];
    this.pcmChunks = [];
    this.pcmSampleCount = 0;
    this.sendJSON({ type: "start", context: this.currentContext });

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

    try {
      this.source?.disconnect();
    } catch {}

    this.source = this.ctx.createMediaStreamSource(stream);

    if (!this.workletNode) {
      this.workletNode = new AudioWorkletNode(this.ctx, "pcm-processor");
      this.workletNode.connect(this.ctx.destination);
    }

    this.workletNode.port.onmessage = (e: MessageEvent) => {
      if (!this.capturing) return;
      const chunk = e.data as ArrayBuffer;
      this.sendAudio(chunk);

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
    this.flushPendingChunks();
    this.sendJSON({
      type: "commit",
      audioDurationMs,
      context: this.currentContext,
    });
  }

  cancel(): void {
    this.stopCapture();
    this.sendJSON({ type: "cancel" });
  }

  // Destructive: clears the internal PCM buffer after encoding. Can only be called once per session.
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

  private stopCapture(): void {
    this.capturing = false;
    try {
      this.source?.disconnect();
    } catch {}
    this.source = null;
  }

  private sendAudio(chunk: ArrayBuffer): void {
    if (
      this.ws?.readyState === WebSocket.OPEN &&
      this.configReceived &&
      this.sessionTransportSupported
    ) {
      this.ws.send(chunk);
      return;
    }
    if (
      this.capturing &&
      (!this.configReceived || this.sessionTransportSupported)
    ) {
      this.pendingChunks.push(chunk);
    }
  }

  private sendJSON(obj: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(obj));
    }
  }

  private flushPendingChunks(): void {
    if (this.configReceived && !this.sessionTransportSupported) {
      this.pendingChunks = [];
      return;
    }
    if (!this.sessionTransportSupported) return;
    if (this.ws?.readyState !== WebSocket.OPEN) return;
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
    this.configReceived = false;

    ws.addEventListener("message", (e) => {
      if (typeof e.data !== "string") return;
      let msg: {
        type: string;
        text?: string;
        message?: string;
        model?: string;
        streaming?: boolean;
        sessionTransport?: boolean;
        providerCategory?: string;
      };
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }
      switch (msg.type) {
        case "config":
          this.streamingSupported = msg.streaming ?? false;
          this.sessionTransportSupported =
            msg.sessionTransport ?? this.streamingSupported;
          this.configReceived = true;
          if (!this.sessionTransportSupported) {
            this.pendingChunks = [];
          }
          this.callbacks.onConfig({
            streaming: this.streamingSupported,
            sessionTransport: this.sessionTransportSupported,
            model: msg.model ?? "",
            providerCategory: msg.providerCategory,
          });
          break;
        case "session.ready":
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
      this.pendingChunks = [];
      if (!this.destroyed && this.sessionTransportSupported) {
        setTimeout(() => {
          if (!this.destroyed) this.openWebSocket();
        }, 1000);
      }
    });
  }
}
