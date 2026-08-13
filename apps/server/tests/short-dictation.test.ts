import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A dictation shorter than the connect time finishes before its provider
 * session is live. Two things used to go wrong there, and both cost the user
 * the whole take: the audio was dropped while the socket was opening, and a
 * commit could resolve before the provider had decoded the held audio.
 */

const sockets: FakeSocket[] = [];

class FakeSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  readyState = 0; // CONNECTING — nothing is ready when recording starts
  binaryType = "arraybuffer";
  /** Audio frames that actually reached the wire, in order. */
  audio: string[] = [];
  control: string[] = [];
  private handlers = new Map<string, (arg?: unknown) => void>();

  send = vi.fn((data: unknown) => {
    if (typeof data === "string") {
      let message: Record<string, unknown>;
      try {
        message = JSON.parse(data) as Record<string, unknown>;
      } catch {
        this.control.push(data);
        return;
      }
      if (message.type === "input_audio_buffer.append") {
        // OpenAI wraps audio in JSON, so retaining the frame itself is enough
        // for these tests; the other providers use binary frames below.
        this.audio.push(data);
      } else if (
        message.message_type === "input_audio_chunk" &&
        message.commit === false
      ) {
        this.audio.push(
          Buffer.from(String(message.audio_base_64), "base64").toString("hex"),
        );
      } else {
        this.control.push(data);
      }
      return;
    }
    this.audio.push(Buffer.from(data as ArrayBuffer).toString("hex"));
  });
  close = vi.fn();
  on = vi.fn((event: string, handler: (arg?: unknown) => void) => {
    this.handlers.set(event, handler);
  });
  addEventListener = vi.fn();

  open(): void {
    this.readyState = FakeSocket.OPEN;
    this.handlers.get("open")?.();
  }
  reply(payload: unknown): void {
    this.handlers.get("message")?.(Buffer.from(JSON.stringify(payload)));
  }

  constructor() {
    sockets.push(this);
  }
}

vi.mock("ws", () => ({ default: FakeSocket }));

const { FreestyleCloudTranscriptionProvider } = await import(
  "../src/lib/streaming/providers/freestyle-cloud.js"
);

type Provider = "freestyle-cloud";

async function openSession(provider: Provider) {
  const onFinal = vi.fn();
  const callbacks = {
    onPartial: vi.fn(),
    onFinal,
    onError: vi.fn(),
    onReady: vi.fn(),
    onClose: vi.fn(),
  };
  const providers = {
    "freestyle-cloud": () =>
      new FreestyleCloudTranscriptionProvider().openStreamingSession({
        apiKey: "k",
        model: "freestyle-cloud/stt-rt-preview",
        languages: ["en"],
        bias: null,
        callbacks,
      }),
  };
  const session = providers[provider]();
  if (provider === "elevenlabs") {
    await vi.waitFor(() => expect(sockets).toHaveLength(1));
  }
  return { session, socket: sockets[0], onFinal };
}

/** Speak, then release — both before the socket has finished opening. */
function shortDictation(session: {
  sendAudio: (c: ArrayBuffer) => void;
  commit: () => void;
}) {
  session.sendAudio(new Uint8Array([1, 2, 3, 4]).buffer);
  session.sendAudio(new Uint8Array([5, 6, 7, 8]).buffer);
  session.commit();
}

describe("a dictation that ends before its session is live", () => {
  beforeEach(() => {
    sockets.length = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ token: "token" }),
      })),
    );
  });

  it.each([
    "freestyle-cloud",
  ] as const)("sends held audio for %s", async (provider) => {
    const { session, socket } = await openSession(provider);

    shortDictation(session);
    expect(socket.audio).toHaveLength(0); // held, not dropped

    socket.open();
    if (provider === "openai") {
      // Open is not enough — OpenAI rejects audio before session.updated.
      expect(socket.audio).toHaveLength(0);
      socket.reply({ type: "session.updated" });
    }

    expect(socket.audio).toEqual([
      provider === "openai" ? expect.any(String) : "01020304",
      provider === "openai" ? expect.any(String) : "05060708",
    ]);
    session.cancel();
  });
});
