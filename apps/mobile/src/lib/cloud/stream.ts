/**
 * Real-time streaming STT client for Freestyle Cloud (`WSS /v2/stream`).
 *
 * Protocol mirrors the desktop's cloud provider exactly:
 *   - Client → server JSON control messages: `start`, `context`, `commit`,
 *     `cancel`.
 *   - Client → server binary frames: raw PCM16LE, 16 kHz, mono.
 *   - Server → client JSON: `config`, `session.ready`, `partial`, `final`,
 *     `error`.
 *
 * On `commit` the cloud Durable Object runs Groq LLM post-processing (unless
 * `skipPostProcess`), so `onFinal` delivers already-cleaned text.
 */

import { cloudStreamWsUrl } from "./config";

/**
 * React Native's `WebSocket` accepts a third `options` argument carrying
 * custom headers (used here for the session cookie) on both iOS and Android.
 * The DOM `WebSocket` lib type doesn't model it, so we describe the RN
 * constructor shape locally.
 */
type RNWebSocketCtor = new (
  url: string,
  protocols: string | string[] | undefined,
  options: { headers: Record<string, string> },
) => WebSocket;

import type {
  CleanupEmailTone,
  CleanupOverallTone,
  CleanupPersonalTone,
  CleanupWorkTone,
} from "../cleanup-tones";

export interface StreamCleanupPreferences {
  /** When true the cloud returns the raw transcript with no LLM cleanup. */
  skipPostProcess: boolean;
  /** Cleanup intensity preset (ignored when `skipPostProcess`). */
  intensity?: string;
  /** Custom cleanup prompt (only meaningful when intensity is "custom"). */
  customPrompt?: string;
  /** Destination-aware tones the cloud applies during post-processing. */
  personalTone?: CleanupPersonalTone;
  workTone?: CleanupWorkTone;
  emailTone?: CleanupEmailTone;
  overallTone?: CleanupOverallTone;
}

export interface StreamCallbacks {
  onReady: (model: string) => void;
  onPartial: (text: string) => void;
  onFinal: (text: string) => void;
  onError: (message: string, code?: string) => void;
  onClose: () => void;
}

export interface StreamSessionOptions {
  /** better-auth session cookie header value (from `authClient.getCookie()`). */
  cookie: string;
  /** Normalized ISO-639-1 hint; omit for auto-detect. */
  language?: string;
  cleanup: StreamCleanupPreferences;
  callbacks: StreamCallbacks;
}

interface ServerMessage {
  type: "config" | "session.ready" | "partial" | "final" | "error";
  text?: string;
  model?: string;
  message?: string;
  code?: string;
}

/**
 * A single dictation session over the cloud WebSocket. Audio frames sent
 * before `session.ready` are buffered and flushed once the upstream is open.
 */
export class CloudStreamSession {
  private ws: WebSocket;
  private ready = false;
  private closed = false;
  private audioDurationMs = 0;
  // A commit requested before the session was ready; fired once it opens so a
  // very short recording (socket still connecting) still yields a final.
  private commitPending = false;
  private readonly pending: ArrayBuffer[] = [];
  private readonly opts: StreamSessionOptions;

  constructor(opts: StreamSessionOptions) {
    this.opts = opts;

    // React Native's WebSocket accepts a headers object as the third argument
    // on both iOS and Android, which is how we pass the session cookie. The
    // cloud resolves the user from the upgrade request headers.
    const WS = WebSocket as unknown as RNWebSocketCtor;
    this.ws = new WS(cloudStreamWsUrl(), undefined, {
      headers: { Cookie: opts.cookie },
    });
    this.ws.binaryType = "arraybuffer";

    this.ws.onopen = () => this.send(this.buildStartMessage());
    this.ws.onmessage = (event) => this.handleMessage(event.data);
    this.ws.onerror = () => {
      if (!this.closed) this.opts.callbacks.onError("Connection error");
    };
    this.ws.onclose = () => {
      this.closed = true;
      this.opts.callbacks.onClose();
    };
  }

  private buildStartMessage() {
    const { language, cleanup } = this.opts;
    return {
      type: "start" as const,
      language: language || undefined,
      skipPostProcess: cleanup.skipPostProcess,
      // Send the full cleanup/tone payload so streaming post-processing behaves
      // like the desktop and batch paths. Omitted entirely when the user has
      // cleanup turned off (skipPostProcess), where the cloud returns raw text.
      ...(cleanup.skipPostProcess
        ? {}
        : {
            intensity: cleanup.intensity,
            customPrompt: cleanup.customPrompt,
            personalTone: cleanup.personalTone,
            workTone: cleanup.workTone,
            emailTone: cleanup.emailTone,
            overallTone: cleanup.overallTone,
          }),
    };
  }

  private send(message: object): void {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  private handleMessage(raw: unknown): void {
    if (typeof raw !== "string") return;
    let msg: ServerMessage;
    try {
      msg = JSON.parse(raw) as ServerMessage;
    } catch {
      return;
    }

    switch (msg.type) {
      case "config":
        break;
      case "session.ready":
        this.ready = true;
        this.flushPending();
        this.opts.callbacks.onReady(msg.model ?? "");
        // A commit that arrived before the session opened runs now, after the
        // buffered audio has been flushed.
        if (this.commitPending) {
          this.commitPending = false;
          this.send({ type: "commit", audioDurationMs: this.audioDurationMs });
        }
        break;
      case "partial":
        if (msg.text) this.opts.callbacks.onPartial(msg.text);
        break;
      case "final":
        this.opts.callbacks.onFinal(msg.text ?? "");
        break;
      case "error":
        this.opts.callbacks.onError(
          msg.message ?? "Unknown cloud error",
          msg.code,
        );
        break;
    }
  }

  private flushPending(): void {
    if (this.ws.readyState !== WebSocket.OPEN) return;
    for (const chunk of this.pending) this.ws.send(chunk);
    this.pending.length = 0;
  }

  /** Feed a raw PCM16LE/16 kHz/mono frame. Buffered until the session is ready. */
  sendAudio(chunk: ArrayBuffer): void {
    if (this.closed) return;
    if (!this.ready || this.ws.readyState !== WebSocket.OPEN) {
      this.pending.push(chunk);
      return;
    }
    this.ws.send(chunk);
  }

  /** Record the captured audio duration to bill/attach with the next commit. */
  setAudioDurationMs(ms: number): void {
    this.audioDurationMs = ms;
  }

  /** Finish the recording and ask the cloud for the final (cleaned) transcript. */
  commit(): void {
    // If the upstream isn't ready yet, defer the commit until `session.ready`
    // so the audio we've buffered isn't discarded.
    if (!this.ready || this.ws.readyState !== WebSocket.OPEN) {
      this.commitPending = true;
      return;
    }
    this.flushPending();
    this.send({ type: "commit", audioDurationMs: this.audioDurationMs });
  }

  /** Abandon the current recording without producing a final transcript. */
  cancel(): void {
    this.send({ type: "cancel" });
    this.audioDurationMs = 0;
  }

  close(): void {
    this.closed = true;
    if (this.ws.readyState <= WebSocket.OPEN) this.ws.close();
  }
}
