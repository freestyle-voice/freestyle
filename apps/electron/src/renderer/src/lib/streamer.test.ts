import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Streamer, type StreamerConnectionState } from "./streamer";

type SocketListener = (event: { data?: unknown }) => void;

class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readonly sent: unknown[] = [];
  readonly listeners = new Map<string, SocketListener[]>();
  readyState = FakeWebSocket.CONNECTING;
  binaryType = "";

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type: string, listener: SocketListener): void {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  send(data: unknown): void {
    this.sent.push(data);
  }

  close(): void {
    if (this.readyState === FakeWebSocket.CLOSED) return;
    this.readyState = FakeWebSocket.CLOSED;
    this.emit("close");
  }

  open(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.emit("open");
  }

  message(message: object): void {
    this.emit("message", { data: JSON.stringify(message) });
  }

  disconnect(): void {
    this.readyState = FakeWebSocket.CLOSED;
    this.emit("close");
  }

  private emit(type: string, event: { data?: unknown } = {}): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }
}

class FakeAudioWorkletNode {
  static instances: FakeAudioWorkletNode[] = [];
  readonly port: {
    onmessage: ((event: { data: ArrayBuffer }) => void) | null;
  } = { onmessage: null };

  constructor() {
    FakeAudioWorkletNode.instances.push(this);
  }
}

class FakeAudioContext {
  state: AudioContextState = "running";
  readonly audioWorklet = { addModule: vi.fn(async () => {}) };

  async resume(): Promise<void> {
    this.state = "running";
  }

  close(): Promise<void> {
    this.state = "closed";
    return Promise.resolve();
  }

  createMediaStreamSource(): {
    connect: () => void;
    disconnect: () => void;
  } {
    return { connect: vi.fn(), disconnect: vi.fn() };
  }
}

describe("Streamer reconnects an active capture", () => {
  let streamer: Streamer | null = null;

  beforeEach(() => {
    vi.useFakeTimers();
    FakeWebSocket.instances = [];
    FakeAudioWorkletNode.instances = [];
    vi.stubGlobal("WebSocket", FakeWebSocket);
    vi.stubGlobal("AudioContext", FakeAudioContext);
    vi.stubGlobal("AudioWorkletNode", FakeAudioWorkletNode);
  });

  afterEach(() => {
    streamer?.destroy();
    streamer = null;
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("waits for config, restarts the session, and replays captured PCM", async () => {
    const connectionStates: StreamerConnectionState[] = [];
    streamer = new Streamer("http://localhost:3000", "", {
      onConfig: vi.fn(),
      onReady: vi.fn(),
      onFinal: vi.fn(),
      onError: vi.fn(),
      onConnectionState: (state) => connectionStates.push(state),
    });

    const firstSocket = FakeWebSocket.instances[0];
    firstSocket.open();

    await streamer.startCapture({} as MediaStream);
    expect(firstSocket.sent).toEqual([]);

    firstSocket.message({
      type: "config",
      streaming: true,
      sessionTransport: true,
      providerCategory: "freestyle_cloud",
    });
    expect(firstSocket.sent).toContainEqual(
      JSON.stringify({ type: "start", context: null }),
    );

    const pcm = new Int16Array([12, -24, 48]).buffer;
    FakeAudioWorkletNode.instances[0].port.onmessage?.({ data: pcm });
    expect(firstSocket.sent).toContain(pcm);

    firstSocket.disconnect();
    expect(connectionStates.at(-1)).toBe("reconnecting");

    await vi.advanceTimersByTimeAsync(400);
    const secondSocket = FakeWebSocket.instances[1];
    secondSocket.open();
    secondSocket.message({
      type: "config",
      streaming: true,
      sessionTransport: true,
      providerCategory: "freestyle_cloud",
    });

    expect(secondSocket.sent).toContainEqual(
      JSON.stringify({ type: "start", context: null }),
    );
    expect(
      secondSocket.sent.some((message) => message instanceof ArrayBuffer),
    ).toBe(false);

    secondSocket.message({ type: "session.ready" });
    const replayedPcm = secondSocket.sent.find(
      (message) => message instanceof ArrayBuffer,
    );
    expect(new Int16Array(replayedPcm as ArrayBuffer)).toEqual(
      new Int16Array([12, -24, 48]),
    );
    expect(streamer.isConnected()).toBe(true);
  });
});
