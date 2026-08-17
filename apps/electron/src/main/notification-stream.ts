export function notificationStreamUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, "")}/api/notifications/stream`;
}

export async function consumeNotificationEvents(
  stream: ReadableStream<Uint8Array>,
  onChange: () => void,
  options?: { onActivity?: () => void; signal?: AbortSignal },
): Promise<void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const abort = (): void => {
    void reader.cancel();
  };
  options?.signal?.addEventListener("abort", abort, { once: true });

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let boundary = buffer.search(/\r?\n\r?\n/);
      while (boundary >= 0) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(
          buffer[boundary] === "\r" ? boundary + 4 : boundary + 2,
        );
        options?.onActivity?.();
        if (frame.split(/\r?\n/).some((line) => line === "event: changed")) {
          onChange();
        }
        boundary = buffer.search(/\r?\n\r?\n/);
      }
    }
  } finally {
    options?.signal?.removeEventListener("abort", abort);
    reader.releaseLock();
  }
}

type NotificationStreamFetch = (
  input: string,
  init: RequestInit,
) => Promise<Response>;

const DEFAULT_INACTIVITY_TIMEOUT_MS = 60_000;

export function startNotificationStream(options: {
  url: string | (() => string);
  headers: HeadersInit | (() => HeadersInit);
  onChange: () => void;
  fetchStream?: NotificationStreamFetch;
  onConnected?: () => void;
  onDisconnected?: () => void;
  inactivityTimeoutMs?: number;
}): () => void {
  const fetchStream = options.fetchStream ?? fetch;
  let stopped = false;
  let controller: AbortController | null = null;
  let reconnects = 0;
  let retryTimer: NodeJS.Timeout | null = null;

  const reconnect = (): void => {
    if (stopped) return;
    const delay = Math.min(1_000 * 2 ** Math.min(reconnects, 5), 30_000);
    reconnects += 1;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      void connect();
    }, delay);
    retryTimer.unref();
  };

  const connect = async (): Promise<void> => {
    const requestController = new AbortController();
    controller = requestController;
    let inactivityTimer: NodeJS.Timeout | null = null;
    const onActivity = (): void => {
      if (inactivityTimer) clearTimeout(inactivityTimer);
      inactivityTimer = setTimeout(
        () => requestController.abort(),
        options.inactivityTimeoutMs ?? DEFAULT_INACTIVITY_TIMEOUT_MS,
      );
      inactivityTimer.unref();
    };
    try {
      // Cover stalled connections as well as quiet established streams. Without
      // this, a proxy that never sends response headers could suppress polling.
      onActivity();
      const url =
        typeof options.url === "function" ? options.url() : options.url;
      const headers =
        typeof options.headers === "function"
          ? options.headers()
          : options.headers;
      const response = await fetchStream(url, {
        headers,
        signal: requestController.signal,
      });
      if (
        !response.ok ||
        !response.body ||
        !response.headers
          .get("content-type")
          ?.toLowerCase()
          .startsWith("text/event-stream")
      ) {
        throw new Error("SSE unavailable");
      }
      reconnects = 0;
      onActivity();
      options.onConnected?.();
      await consumeNotificationEvents(response.body, options.onChange, {
        onActivity,
        signal: requestController.signal,
      });
    } catch {
      // The reconnect below handles server restarts and temporary network loss.
    } finally {
      if (inactivityTimer) clearTimeout(inactivityTimer);
      if (controller === requestController) controller = null;
      if (!stopped) options.onDisconnected?.();
      reconnect();
    }
  };

  void connect();
  return (): void => {
    stopped = true;
    controller?.abort();
    if (retryTimer) clearTimeout(retryTimer);
  };
}
