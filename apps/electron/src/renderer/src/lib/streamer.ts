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
const RECONNECT_BASE_DELAY_MS = 400;
const RECONNECT_MAX_DELAY_MS = 5_000;

export type StreamerConnectionState =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected";

export interface StreamerCallbacks {
  onPartial: (text: string) => void;
  onFinal: (text: string) => void;
  onCleaned?: (text: string) => void;
  onError: (message: string, code?: string) => void;
  onReady: () => void;
  onConnectionState?: (state: StreamerConnectionState) => void;
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
  private connectionState: StreamerConnectionState = "disconnected";
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  /**
   * A `start` message is meaningful only after the server has announced the
   * transport config. Keep it pending across a cold socket or reconnect so the
   * first recording after a disconnect cannot silently stream into no session.
   */
  private sessionStartPending = false;

  // Capture pipeline — reused across sessions when possible
  private ctx: AudioContext | null = null;
  private workletReady = false;
  private source: MediaStreamAudioSourceNode | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private capturing = false;

  // PCM accumulator for REST fallback WAV generation
  private pcmChunks: Int16Array[] = [];
  private pcmSampleCount = 0;

  constructor(baseUrl: string, token: string, callbacks: StreamerCallbacks) {
    // Browsers can't set an Authorization header on a WebSocket, so a
    // configured server's bearer token travels as a `?token=` query param
    // (the server authenticates WS upgrades from it). Empty for the local
    // server / no-auth case.
    const wsBase = `${baseUrl.replace(/^http/, "ws")}/stream`;
    this.wsUrl = token
      ? `${wsBase}?token=${encodeURIComponent(token)}`
      : wsBase;
    this.callbacks = callbacks;
    this.openWebSocket();
  }

  // ------- public API -------

  setContext(context: string | null): void {
    this.currentContext = context;
    this.sendJSON({ type: "context", context });
  }

  isConnected(): boolean {
    return (
      this.ws?.readyState === WebSocket.OPEN &&
      this.configReceived &&
      this.connectionState === "connected"
    );
  }

  hasCapturedAudio(): boolean {
    return this.pcmSampleCount > 0;
  }

  async startCapture(stream: MediaStream): Promise<void> {
    this.capturing = true;
    this.pendingChunks = [];
    this.pcmChunks = [];
    this.pcmSampleCount = 0;
    this.sessionStartPending = true;
    this.ensureConnected();
    this.startPendingSession();

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
    this.sessionStartPending = false;
    this.flushPendingChunks();
    this.sendJSON({
      type: "commit",
      audioDurationMs,
      context: this.currentContext,
    });
  }

  cancel(): void {
    this.stopCapture();
    this.sessionStartPending = false;
    this.sendJSON({ type: "cancel" });
  }

  // Encodes the recorded PCM into a WAV blob for the REST fallback. Reads the
  // buffer non-destructively so a retry (e.g. error and timeout both firing)
  // still gets the audio; the buffer is reset by the next startCapture.
  getWavBlob(): Blob | null {
    if (this.pcmSampleCount === 0) return null;
    return encodeWavFromInt16(this.pcmChunks, this.pcmSampleCount, TARGET_RATE);
  }

  destroy(): void {
    this.destroyed = true;
    this.sessionStartPending = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopCapture();
    this.workletNode = null;
    if (this.ws && this.ws.readyState <= WebSocket.OPEN) this.ws.close();
    this.ws = null;
    this.setConnectionState("disconnected");
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

  private setConnectionState(state: StreamerConnectionState): void {
    if (this.connectionState === state) return;
    this.connectionState = state;
    this.callbacks.onConnectionState?.(state);
  }

  private ensureConnected(): void {
    if (
      this.ws &&
      (this.ws.readyState === WebSocket.CONNECTING ||
        this.ws.readyState === WebSocket.OPEN)
    ) {
      return;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.openWebSocket();
  }

  private startPendingSession(): void {
    if (
      !this.sessionStartPending ||
      !this.capturing ||
      !this.configReceived ||
      this.ws?.readyState !== WebSocket.OPEN
    ) {
      return;
    }
    this.ws.send(
      JSON.stringify({ type: "start", context: this.currentContext }),
    );
    this.sessionStartPending = false;
  }

  /**
   * Rebuild the unsent queue from the full capture after the control socket
   * drops. The server closes the old upstream with that socket, so replaying
   * the complete recording into the fresh session is both safe and necessary.
   */
  private stageCapturedAudioForReplay(): void {
    this.pendingChunks = this.pcmChunks.map(
      (chunk) =>
        chunk.buffer.slice(
          chunk.byteOffset,
          chunk.byteOffset + chunk.byteLength,
        ) as ArrayBuffer,
    );
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

  private scheduleReconnect(): void {
    if (this.destroyed || this.reconnectTimer) return;
    const delay = Math.min(
      RECONNECT_BASE_DELAY_MS * 2 ** this.reconnectAttempts,
      RECONNECT_MAX_DELAY_MS,
    );
    this.reconnectAttempts += 1;
    this.setConnectionState("reconnecting");
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.openWebSocket();
    }, delay);
  }

  private openWebSocket(): void {
    if (this.destroyed) return;
    if (
      this.ws &&
      (this.ws.readyState === WebSocket.CONNECTING ||
        this.ws.readyState === WebSocket.OPEN)
    ) {
      return;
    }
    this.setConnectionState(
      this.reconnectAttempts > 0 ? "reconnecting" : "connecting",
    );
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
        code?: string;
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
          this.reconnectAttempts = 0;
          this.setConnectionState("connected");
          if (!this.sessionTransportSupported) {
            this.pendingChunks = [];
          }
          this.callbacks.onConfig({
            streaming: this.streamingSupported,
            sessionTransport: this.sessionTransportSupported,
            model: msg.model ?? "",
            providerCategory: msg.providerCategory,
          });
          this.startPendingSession();
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
          this.callbacks.onError(msg.message ?? "Unknown error", msg.code);
          break;
      }
    });

    ws.addEventListener("error", () => {});

    ws.addEventListener("close", () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.configReceived = false;
      if (this.capturing) {
        this.sessionStartPending = true;
        this.stageCapturedAudioForReplay();
      }
      if (!this.destroyed) this.scheduleReconnect();
    });
  }
}
