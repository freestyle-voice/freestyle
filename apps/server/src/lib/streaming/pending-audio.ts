/**
 * Audio that arrives before a provider's upstream socket can take it.
 *
 * Recording starts the instant the hotkey goes down, but an upstream session
 * takes a moment to open and configure — so for the first few hundred
 * milliseconds of every dictation there is audio with nowhere to go. Dropping
 * it costs the user the start of their sentence, and on a short take that is
 * the whole thing.
 *
 * Every streaming provider holds that audio here and flushes it once the
 * socket is usable, rather than each deciding for itself. The cap is a safety
 * valve for a session that never opens, not a normal operating limit: at the
 * capture worklet's 80ms chunks it is well over a minute of audio, far longer
 * than any setup that is going to succeed.
 */
const MAX_PENDING_CHUNKS = 1024;

export interface PendingAudio {
  /** Hold a chunk until the socket is ready, evicting the oldest at the cap. */
  hold(chunk: ArrayBuffer): void;
  /** Send everything held, oldest first, and empty the buffer. */
  flush(send: (chunk: ArrayBuffer) => void): void;
  /** Drop what's held — a cancelled or restarted session. */
  clear(): void;
}

export function createPendingAudio(): PendingAudio {
  let chunks: ArrayBuffer[] = [];

  return {
    hold(chunk: ArrayBuffer): void {
      if (chunks.length >= MAX_PENDING_CHUNKS) chunks.shift();
      chunks.push(chunk);
    },
    flush(send: (chunk: ArrayBuffer) => void): void {
      // Detach before sending: a send that throws, or that re-enters through a
      // synchronous error handler, must not replay what has already gone out.
      const queued = chunks;
      chunks = [];
      for (const chunk of queued) send(chunk);
    },
    clear(): void {
      chunks = [];
    },
  };
}
