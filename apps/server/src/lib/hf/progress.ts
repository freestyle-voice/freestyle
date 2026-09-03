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
