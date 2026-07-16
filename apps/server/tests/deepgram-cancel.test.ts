import { beforeEach, describe, expect, it, vi } from "vitest";

// Capture every fake socket the provider opens so the test can inspect the
// control frames it sends. Deepgram is a keep-warm provider, so cancel() must
// leave the socket open for reuse instead of sending CloseStream (which would
// make the server reconnect).
const sockets: FakeSocket[] = [];

class FakeSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  readyState = 1; // OPEN
  binaryType = "arraybuffer";
  sent: string[] = [];
  closed = false;
  send = vi.fn((data: unknown) => {
    if (typeof data === "string") this.sent.push(data);
  });
  close = vi.fn(() => {
    this.closed = true;
  });
  on = vi.fn();
  addEventListener = vi.fn();

  constructor() {
    sockets.push(this);
  }
}

vi.mock("ws", () => ({ default: FakeSocket }));

const { DeepgramTranscriptionProvider } = await import(
  "../src/lib/streaming/providers/deepgram.js"
);

function openSession() {
  const provider = new DeepgramTranscriptionProvider();
  return provider.openStreamingSession({
    apiKey: "test-key",
    model: "nova-3",
    language: "en",
    bias: null,
    callbacks: {
      onReady: vi.fn(),
      onPartial: vi.fn(),
      onFinal: vi.fn(),
      onError: vi.fn(),
    },
  });
}

describe("DeepgramTranscriptionProvider.cancel", () => {
  beforeEach(() => {
    sockets.length = 0;
  });

  it("keeps the warm socket open — never sends CloseStream or closes it", () => {
    const session = openSession();
    const socket = sockets[0];

    session.cancel();

    expect(socket.sent).not.toContain(JSON.stringify({ type: "CloseStream" }));
    expect(socket.close).not.toHaveBeenCalled();
    expect(socket.closed).toBe(false);
  });

  it("close() tears the socket down", () => {
    const session = openSession();
    const socket = sockets[0];

    session.close();

    expect(socket.close).toHaveBeenCalled();
  });
});
