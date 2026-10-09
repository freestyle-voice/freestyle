import type { Socket } from "node:net";
import type { ServerType } from "@hono/node-server";
import { WebSocket, WebSocketServer } from "ws";

/** EventEmitter listeners inherit the emitter's context, not their registration context. */
export function ownedWebSocketServer(
  run: <T>(work: () => T) => T,
): WebSocketServer {
  class OwnedWebSocket extends WebSocket {
    override emit(event: string | symbol, ...args: unknown[]): boolean {
      return run(() => super.emit(event, ...args));
    }
  }
  // ws exposes this constructor option for accepted clients. Bind dispatch so
  // message/close callbacks and their asynchronous continuations stay owned.
  return new WebSocketServer({ noServer: true, WebSocket: OwnedWebSocket });
}

/** Stop accepting work, allow active requests to finish, then force lingering sockets closed. */
export function connectionStopper(server: ServerType, wss: WebSocketServer) {
  const sockets = new Set<Socket>();
  const onConnection = (socket: Socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
  };
  server.on("connection", onConnection);

  return async (gracePeriodMs: number): Promise<void> => {
    const httpClosed = new Promise<void>((resolve) =>
      server.close(() => resolve()),
    );
    const wsClosed = new Promise<void>((resolve) => wss.close(() => resolve()));
    // ws.close() stops accepting upgrades, but existing clients need a close frame.
    for (const client of wss.clients)
      client.close(1001, "Server shutting down");
    // Also cover an upgrade which was already in progress when stop began.
    const onWebSocket = (client: import("ws").WebSocket) =>
      client.close(1001, "Server shutting down");
    wss.on("connection", onWebSocket);
    const timer = setTimeout(() => {
      for (const client of wss.clients) client.terminate();
      // closeAllConnections excludes upgraded sockets; track TCP connections too.
      for (const socket of sockets) socket.destroy();
    }, gracePeriodMs);
    try {
      await Promise.all([httpClosed, wsClosed]);
    } finally {
      clearTimeout(timer);
      server.off("connection", onConnection);
      wss.off("connection", onWebSocket);
    }
  };
}

/** A misbehaving plugin must not hold Electron/container shutdown open forever. */
export async function boundedCleanup(
  cleanup: () => unknown,
  name: string,
  timeoutMs = 2_000,
): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      Promise.resolve().then(cleanup),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${name} shutdown timed out`)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
