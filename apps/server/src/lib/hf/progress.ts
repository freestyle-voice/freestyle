/**
 * Progress-tracking wrapper around `fetch`, used to drive the download progress
 * UI while delegating the actual transfer + caching to `@huggingface/hub`.
 *
 * The hub download helpers accept a custom `fetch`. We pass one that streams the
 * response body through a byte counter (with the same 500ms speed window the
 * legacy raw-fetch path used) and is bound to an AbortSignal for cancellation.
 *
 * `bytesTotal` is owned by the caller (set from the model's known size) rather
 * than read from `content-length`, because the hub client may issue several
 * requests (metadata + blob) and only the blob carries the real size.
 */
export interface ProgressSink {
  bytesDownloaded: number;
  bytesTotal: number;
  speedBps: number;
  lastUpdate: number;
  lastBytes: number;
}

export function progressFetch(
  sink: ProgressSink,
  signal: AbortSignal,
): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const res = await fetch(input, { ...init, signal, redirect: "follow" });
    if (!res.ok || !res.body) return res;

    const reader = res.body.getReader();
    const tracked = new ReadableStream<Uint8Array>({
      async pull(controller) {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          return;
        }
        sink.bytesDownloaded += value.byteLength;
        const now = Date.now();
        const elapsed = now - sink.lastUpdate;
        if (elapsed >= 500) {
          sink.speedBps = Math.round(
            ((sink.bytesDownloaded - sink.lastBytes) / elapsed) * 1000,
          );
          sink.lastUpdate = now;
          sink.lastBytes = sink.bytesDownloaded;
        }
        controller.enqueue(value);
      },
      cancel(reason) {
        reader.cancel(reason).catch(() => {});
      },
    });

    return new Response(tracked, {
      status: res.status,
      statusText: res.statusText,
      headers: res.headers,
    });
  }) as typeof fetch;
}
