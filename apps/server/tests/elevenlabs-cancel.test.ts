import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ElevenLabs is a keep-warm provider, so cancel() must leave the socket open
// for reuse; only close() should tear it down. (Closing on cancel fires
// onClose and makes the stream route reconnect — the same bug fixed in
// Deepgram.)
const sockets: FakeSocket[] = [];

class FakeSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  readyState = 1; // OPEN
  sent: unknown[] = [];
  closed = false;
  private handlers: Record<string, (arg?: unknown) => void> = {};
  send = vi.fn((data: unknown) => {
    this.sent.push(data);
  });
  close = vi.fn(() => {
    this.closed = true;
  });
  on = vi.fn((event: string, cb: (arg?: unknown) => void) => {
    this.handlers[event] = cb;
  });

  constructor() {
    sockets.push(this);
  }

  emit(event: string, arg?: unknown): void {
    this.handlers[event]?.(arg);
  }
}

vi.mock("ws", () => ({ default: FakeSocket }));

const { ElevenLabsTranscriptionProvider } = await import(
  "../src/lib/streaming/providers/elevenlabs.js"
);

async function openReadySession() {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ token: "tok" }), { status: 200 }),
  );

  const provider = new ElevenLabsTranscriptionProvider();
  const session = provider.openStreamingSession({
    apiKey: "test-key",
    model: "scribe_v2",
    language: "en",
    bias: null,
    callbacks: {
      onReady: vi.fn(),
      onPartial: vi.fn(),
      onFinal: vi.fn(),
      onError: vi.fn(),
    },
  });

  // Let the token fetch resolve and the WebSocket get constructed, then fire
  // the open handler so the session is fully established.
  await vi.waitFor(() => expect(sockets.length).toBe(1));
  sockets[0].emit("open");
  return session;
}

describe("ElevenLabsTranscriptionProvider.cancel", () => {
  beforeEach(() => {
    sockets.length = 0;
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps the warm socket open on cancel", async () => {
    const session = await openReadySession();
    session.cancel();

    expect(sockets[0].close).not.toHaveBeenCalled();
    expect(sockets[0].closed).toBe(false);
  });

  it("close() tears the socket down", async () => {
    const session = await openReadySession();
    session.close();

    expect(sockets[0].close).toHaveBeenCalled();
  });
});
