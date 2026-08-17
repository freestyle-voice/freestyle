export function notificationStreamUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, "")}/api/notifications/stream`;
}

export async function consumeNotificationEvents(
  stream: ReadableStream<Uint8Array>,
  onChange: () => void,
): Promise<void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

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
        if (frame.split(/\r?\n/).some((line) => line === "event: changed")) {
          onChange();
        }
        boundary = buffer.search(/\r?\n\r?\n/);
      }
    }
  } finally {
    reader.releaseLock();
  }
}

type NotificationStreamFetch = (
  input: string,
  init: RequestInit,
) => Promise<Response>;

export function startNotificationStream(options: {
  url: string | (() => string);
  headers: HeadersInit | (() => HeadersInit);
  onChange: () => void;
  fetchStream?: NotificationStreamFetch;
  onConnected?: () => void;
  onDisconnected?: () => void;
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
    try {
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
      options.onConnected?.();
      await consumeNotificationEvents(response.body, options.onChange);
    } catch {
      // The reconnect below handles server restarts and temporary network loss.
    } finally {
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
