import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A dictation shorter than the Soniox connect time commits before the session
 * is open. The provider buffers that audio and, on `open`, flushes it and
 * finalizes in one go — so the audio and the finalize reach Soniox together,
 * and the first reply can easily carry no tokens at all.
 *
 * Delivering on that reply returns an empty transcript for exactly the takes
 * that are hardest to redo ("yes", "on it", a name). These tests pin the
 * distinction the provider has to make: *no tokens yet* is not the same as
 * *no speech*, and only the latter should resolve to "".
 */

const sockets: FakeSocket[] = [];

class FakeSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  readyState = 0; // CONNECTING — the session opens before Soniox is up
  binaryType = "arraybuffer";
  sent: string[] = [];
  binaryFrames = 0;
  closed = false;
  private handlers = new Map<string, (arg?: unknown) => void>();

  send = vi.fn((data: unknown) => {
    if (typeof data === "string") this.sent.push(data);
    else this.binaryFrames++;
  });
  close = vi.fn(() => {
    this.closed = true;
  });
  on = vi.fn((event: string, handler: (arg?: unknown) => void) => {
    this.handlers.set(event, handler);
  });
  addEventListener = vi.fn();

  /** Drive a lifecycle event the way the real socket would. */
  emit(event: string, arg?: unknown): void {
    this.handlers.get(event)?.(arg);
  }
  reply(payload: unknown): void {
    this.emit("message", Buffer.from(JSON.stringify(payload)));
  }

  constructor() {
    sockets.push(this);
  }
}

vi.mock("ws", () => ({ default: FakeSocket }));

const { SonioxTranscriptionProvider } = await import(
  "../src/lib/streaming/providers/soniox.js"
);

function openSession() {
  const onFinal = vi.fn();
  const onPartial = vi.fn();
  const provider = new SonioxTranscriptionProvider();
  const session = provider.openStreamingSession({
    apiKey: "test-key",
    model: "soniox/stt-rt-preview",
    languages: ["en"],
    bias: null,
    callbacks: {
      onPartial,
      onFinal,
      onError: vi.fn(),
      onReady: vi.fn(),
      onClose: vi.fn(),
    },
  });
  return { session, socket: sockets[0], onFinal, onPartial };
}

/** The short-dictation shape: audio, then commit, both before `open`. */
function commitBeforeOpen(session: ReturnType<typeof openSession>["session"]) {
  session.sendAudio(new ArrayBuffer(3200));
  session.commit();
}

describe("soniox short dictation", () => {
  beforeEach(() => {
    sockets.length = 0;
    vi.useRealTimers();
  });

  it("does not deliver an empty final on a token-less reply", () => {
    const { session, socket, onFinal } = openSession();
    commitBeforeOpen(session);

    socket.readyState = FakeSocket.OPEN;
    socket.emit("open");

    // The buffered audio was flushed and finalize sent together.
    expect(socket.binaryFrames).toBe(1);
    expect(socket.sent.some((m) => m.includes("finalize"))).toBe(true);

    // Soniox acknowledges before it has decoded anything.
    socket.reply({ tokens: [] });

    expect(onFinal).not.toHaveBeenCalled();
  });

  it("delivers the transcript once tokens actually arrive", () => {
    const { session, socket, onFinal } = openSession();
    commitBeforeOpen(session);

    socket.readyState = FakeSocket.OPEN;
    socket.emit("open");
    socket.reply({ tokens: [] });
    socket.reply({
      tokens: [
        { text: "on", is_final: true },
        { text: " it", is_final: true },
      ],
    });

    expect(onFinal).toHaveBeenCalledTimes(1);
    expect(onFinal.mock.calls[0][0]).toBe("on it");
  });

  it("still resolves genuine silence, via the finished message", () => {
    const { session, socket, onFinal } = openSession();
    commitBeforeOpen(session);

    socket.readyState = FakeSocket.OPEN;
    socket.emit("open");
    socket.reply({ tokens: [] });
    expect(onFinal).not.toHaveBeenCalled();

    socket.reply({ finished: true });

    expect(onFinal).toHaveBeenCalledTimes(1);
    expect(onFinal.mock.calls[0][0]).toBe("");
  });
});
