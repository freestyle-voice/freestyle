import {
  type ConnectorCatalogItem,
  connectorStatus,
  connectToolkit,
  disconnectToolkit,
  listConnectorCatalog,
} from "@renderer/lib/connectors";
import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

const POLL_INTERVAL_MS = 2_000;
const POLL_TIMEOUT_MS = 5 * 60_000;

function ConnectorCard({
  connector,
  busy,
  onConnect,
  onDisconnect,
}: {
  connector: ConnectorCatalogItem;
  busy: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
}): React.JSX.Element {
  const connection = connector.connection;
  const connected = connection?.status === "active";
  const pending = connection?.status === "pending";
  const reconnect = connection?.status === "needs_reconnect";
  return (
    <div className="tavern-set-card">
      <div className="tavern-set-card-title">{connector.name}</div>
      <div className="tavern-set-card-sub">
        {connected
          ? `${connection.accountLabel ?? "Connected"} · ${connection.toolCount} tools`
          : pending
            ? "Waiting for approval in your browser…"
            : reconnect
              ? "Connection needs to be renewed"
              : "Available to Remix"}
      </div>
      {connection?.statusReason ? (
        <p className="tavern-set-hint">{connection.statusReason}</p>
      ) : null}
      <div className="tavern-set-seg">
        {connected ? (
          <button
            type="button"
            className="tavern-set-seg-btn"
            disabled={busy}
            onClick={onDisconnect}
          >
            Disconnect
          </button>
        ) : (
          <button
            type="button"
            className="tavern-set-seg-btn is-on"
            disabled={busy || pending}
            onClick={onConnect}
          >
            {busy ? "Opening…" : reconnect ? "Reconnect" : "Connect"}
          </button>
        )}
      </div>
    </div>
  );
}

export function ConnectedApps(): React.JSX.Element {
  const [query, setQuery] = useState("");
  const [catalog, setCatalog] = useState<ConnectorCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyToolkit, setBusyToolkit] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setCatalog(await listConnectorCatalog(query));
      setError(null);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Connected apps are unavailable.",
      );
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 150);
    return () => window.clearTimeout(timer);
  }, [load]);

  const pending = useMemo(
    () =>
      catalog
        .filter((item) => item.connection?.status === "pending")
        .map((item) => item.slug),
    [catalog],
  );
  useEffect(() => {
    if (pending.length === 0) return;
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
        window.clearInterval(timer);
        return;
      }
      void Promise.all(pending.map((toolkit) => connectorStatus(toolkit)))
        .then(() => void load())
        .catch(() => {});
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [load, pending]);

  const connect = async (toolkit: string) => {
    setBusyToolkit(toolkit);
    try {
      await connectToolkit(toolkit);
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not start that connection.",
      );
    } finally {
      setBusyToolkit(null);
    }
  };
  const disconnect = async (toolkit: string) => {
    setBusyToolkit(toolkit);
    try {
      await disconnectToolkit(toolkit);
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not disconnect that app.",
      );
    } finally {
      setBusyToolkit(null);
    }
  };

  const connected = catalog.filter(
    (item) => item.connection && item.connection.status !== "disconnected",
  );
  const available = catalog.filter(
    (item) => !item.connection || item.connection.status === "disconnected",
  );
  return (
    <>
      <p className="tavern-set-hint is-lead">
        Connect an app once, then Remix can use only your account. You approve
        every action that changes data outside Freestyle.
      </p>
      <input
        className="tavern-set-input"
        value={query}
        placeholder="Search connected apps"
        aria-label="Search connected apps"
        onChange={(event) => setQuery(event.target.value)}
      />
      {error ? <p className="tavern-set-hint">{error}</p> : null}
      {loading ? (
        <p className="tavern-set-hint">Loading connected apps…</p>
      ) : null}
      {connected.length > 0 ? (
        <div className="tavern-set-section">Connected</div>
      ) : null}
      {connected.map((connector) => (
        <ConnectorCard
          key={connector.slug}
          connector={connector}
          busy={busyToolkit === connector.slug}
          onConnect={() => void connect(connector.slug)}
          onDisconnect={() => void disconnect(connector.slug)}
        />
      ))}
      {available.length > 0 ? (
        <div className="tavern-set-section">Available</div>
      ) : null}
      {available.map((connector) => (
        <ConnectorCard
          key={connector.slug}
          connector={connector}
          busy={busyToolkit === connector.slug}
          onConnect={() => void connect(connector.slug)}
          onDisconnect={() => void disconnect(connector.slug)}
        />
      ))}
      {!loading && catalog.length === 0 ? (
        <p className="tavern-set-hint">No connected apps match that search.</p>
      ) : null}
    </>
  );
}
