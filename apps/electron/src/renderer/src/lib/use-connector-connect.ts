import { capture } from "@renderer/lib/analytics";
import {
  connectorStatus,
  connectToolkit,
  connectToolkitWithCredentials,
} from "@renderer/lib/connectors";
import { queryKeys } from "@renderer/lib/query";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";

const POLL_INTERVAL_MS = 2_000;
const POLL_TIMEOUT_MS = 5 * 60_000;

export type ConnectPhase = "opening" | "pending" | "connected";

/**
 * One connect-and-poll implementation shared by the Apps page and in-chat
 * connect cards: open the system browser, then poll the connection status
 * until it becomes active, times out, or fails.
 */
export function useConnectorConnect() {
  const queryClient = useQueryClient();
  const [phases, setPhases] = useState<Record<string, ConnectPhase>>({});
  const [error, setError] = useState<string | null>(null);
  const timers = useRef<Map<string, number>>(new Map());
  // Every connect surface funnels through this hook, so instrumenting here
  // covers the openers, the in-chat cards and the Apps tab at once.
  const attempts = useRef<Map<string, { at: number; authMode: string }>>(
    new Map(),
  );

  const started = useCallback((slug: string, authMode: string) => {
    attempts.current.set(slug, { at: Date.now(), authMode });
    capture("connector_connect_started", { toolkit: slug, authMode });
  }, []);

  const connected = useCallback((slug: string) => {
    const attempt = attempts.current.get(slug);
    attempts.current.delete(slug);
    capture("connector_connected", {
      toolkit: slug,
      authMode: attempt?.authMode ?? "oauth",
      ...(attempt ? { elapsedMs: Date.now() - attempt.at } : {}),
    });
  }, []);

  const setPhase = useCallback((slug: string, phase: ConnectPhase | null) => {
    setPhases((current) => {
      const next = { ...current };
      if (phase) next[slug] = phase;
      else delete next[slug];
      return next;
    });
  }, []);

  const stopPolling = useCallback((slug: string) => {
    const timer = timers.current.get(slug);
    if (timer !== undefined) window.clearInterval(timer);
    timers.current.delete(slug);
  }, []);

  useEffect(() => {
    const active = timers.current;
    return () => {
      for (const timer of active.values()) window.clearInterval(timer);
      active.clear();
    };
  }, []);

  const cancel = useCallback(
    (slug: string) => {
      stopPolling(slug);
      setPhase(slug, null);
    },
    [setPhase, stopPolling],
  );

  const connect = useCallback(
    (slug: string) => {
      setError(null);
      setPhase(slug, "opening");
      started(slug, "oauth");
      void connectToolkit(slug)
        .then(() => {
          setPhase(slug, "pending");
          const startedAt = Date.now();
          stopPolling(slug);
          const timer = window.setInterval(() => {
            if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
              stopPolling(slug);
              setPhase(slug, null);
              setError(
                "This connection is still pending. Finish it in your browser, or open it again to restart.",
              );
              return;
            }
            void connectorStatus(slug)
              .then((connection) => {
                if (connection?.status === "active") {
                  stopPolling(slug);
                  setPhase(slug, "connected");
                  connected(slug);
                  void queryClient.invalidateQueries({
                    queryKey: queryKeys.connectors.all,
                  });
                } else if (connection?.status === "needs_reconnect") {
                  stopPolling(slug);
                  setPhase(slug, null);
                  setError(
                    connection.statusReason ??
                      "That connection could not be completed. Try again.",
                  );
                  void queryClient.invalidateQueries({
                    queryKey: queryKeys.connectors.all,
                  });
                }
              })
              .catch(() => {});
          }, POLL_INTERVAL_MS);
          timers.current.set(slug, timer);
        })
        .catch((cause) => {
          setPhase(slug, null);
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not start that connection.",
          );
        });
    },
    [queryClient, setPhase, stopPolling, started, connected],
  );

  const connectWithCredentials = useCallback(
    (slug: string, credentials: Record<string, string>) => {
      setError(null);
      setPhase(slug, "opening");
      started(slug, "api_key");
      void connectToolkitWithCredentials(slug, credentials)
        .then((connection) => {
          if (connection?.status === "active") {
            setPhase(slug, "connected");
            connected(slug);
          } else {
            setPhase(slug, null);
            setError("That API key could not be verified.");
          }
          void queryClient.invalidateQueries({
            queryKey: queryKeys.connectors.all,
          });
        })
        .catch((cause) => {
          setPhase(slug, null);
          setError(
            cause instanceof Error
              ? cause.message
              : "That API key could not be verified.",
          );
        });
    },
    [queryClient, setPhase, started, connected],
  );

  return {
    connect,
    connectWithCredentials,
    cancel,
    phases,
    error,
    clearError: () => setError(null),
  };
}
