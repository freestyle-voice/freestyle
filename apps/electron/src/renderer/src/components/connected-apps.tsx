import {
  type ConnectorCatalogItem,
  type ConnectorCatalogPage,
  connectorStatus,
  connectToolkit,
  disconnectToolkit,
} from "@renderer/lib/connectors";
import {
  connectorCatalogInfiniteQueryOptions,
  queryKeys,
} from "@renderer/lib/query";
import {
  type InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";

const POLL_INTERVAL_MS = 2_000;
const POLL_TIMEOUT_MS = 5 * 60_000;

function connectionCopy(connector: ConnectorCatalogItem): string {
  const connection = connector.connection;
  if (connection?.status === "active")
    return `${connection.accountLabel ?? "Connected"} · ${connection.toolCount} ${connection.toolCount === 1 ? "tool" : "tools"}`;
  if (connection?.status === "pending")
    return "Finish connecting in your browser";
  if (connection?.status === "needs_reconnect")
    return "Reconnect to keep using this app";
  return "Available to Freestyle";
}

function connectionBadge(connector: ConnectorCatalogItem): string | null {
  switch (connector.connection?.status) {
    case "active":
      return "Connected";
    case "pending":
      return "In progress";
    case "needs_reconnect":
      return "Needs attention";
    default:
      return null;
  }
}

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
  const badge = connectionBadge(connector);
  const action = connected
    ? "Disconnect"
    : busy
      ? "Opening…"
      : pending
        ? "Open browser"
        : reconnect
          ? "Reconnect"
          : "Connect";

  return (
    <article
      className={`connector-card${connected ? " is-connected" : ""}${pending ? " is-pending" : ""}${reconnect ? " needs-reconnect" : ""}`}
    >
      <div className="connector-mark" aria-hidden="true">
        {connector.name.slice(0, 1)}
      </div>
      <div className="connector-card-copy">
        <div className="connector-card-heading">
          <strong>{connector.name}</strong>
          {badge ? <span className="connector-state">{badge}</span> : null}
        </div>
        <p>{connectionCopy(connector)}</p>
        {connection?.statusReason ? (
          <p className="connector-reason">{connection.statusReason}</p>
        ) : null}
      </div>
      <button
        type="button"
        className={`connector-action${connected ? " is-secondary" : ""}`}
        disabled={busy}
        onClick={connected ? onDisconnect : onConnect}
      >
        {action}
      </button>
    </article>
  );
}

function ConnectedAppsSkeleton(): React.JSX.Element {
  return (
    <div className="connector-skeleton" aria-hidden="true">
      {["first", "second", "third"].map((key) => (
        <div key={key} className="connector-skeleton-row">
          <span className="connector-skeleton-mark" />
          <span className="connector-skeleton-copy">
            <i />
            <i />
          </span>
          <span className="connector-skeleton-action" />
        </div>
      ))}
    </div>
  );
}

export function ConnectedApps(): React.JSX.Element {
  const [query, setQuery] = useState("");
  const queryClient = useQueryClient();
  const catalogQuery = useInfiniteQuery(connectorCatalogInfiniteQueryOptions());
  const catalog = useMemo(
    () => catalogQuery.data?.pages.flatMap((page) => page.connectors) ?? [],
    [catalogQuery.data],
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const [pollStartedAt, setPollStartedAt] = useState(0);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const pending = useMemo(
    () =>
      catalog
        .filter((item) => item.connection?.status === "pending")
        .map((item) => item.slug),
    [catalog],
  );
  const pendingKey = pending.join(",");
  useEffect(() => {
    if (!pendingKey) return;
    const startedAt = pollStartedAt || Date.now();
    const pendingToolkits = pendingKey.split(",");
    const timer = window.setInterval(() => {
      if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
        window.clearInterval(timer);
        setActionError(
          "This connection is still pending. Finish it in your browser, or open it again to restart.",
        );
        return;
      }
      void Promise.all(
        pendingToolkits.map((toolkit) => connectorStatus(toolkit)),
      )
        .then((statuses) => {
          queryClient.setQueryData<InfiniteData<ConnectorCatalogPage>>(
            queryKeys.connectors.catalog,
            (current) => {
              if (!current) return current;
              const statusByToolkit = new Map(
                pendingToolkits.map((toolkit, index) => [
                  toolkit,
                  statuses[index] ?? null,
                ]),
              );
              return {
                ...current,
                pages: current.pages.map((page) => ({
                  ...page,
                  connectors: page.connectors.map((item) =>
                    statusByToolkit.has(item.slug)
                      ? {
                          ...item,
                          connection: statusByToolkit.get(item.slug) ?? null,
                        }
                      : item,
                  ),
                })),
              };
            },
          );
        })
        .catch(() => {});
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [pendingKey, pollStartedAt, queryClient]);

  const connectMutation = useMutation({
    mutationFn: connectToolkit,
    onSuccess: async () => {
      setPollStartedAt(Date.now());
      await queryClient.invalidateQueries({
        queryKey: queryKeys.connectors.catalog,
      });
    },
  });
  const disconnectMutation = useMutation({
    mutationFn: disconnectToolkit,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.connectors.catalog,
      });
    },
  });

  const connect = (toolkit: string) => {
    setActionError(null);
    connectMutation.mutate(toolkit, {
      onError: (cause) =>
        setActionError(
          cause instanceof Error
            ? cause.message
            : "Could not start that connection.",
        ),
    });
  };
  const disconnect = (toolkit: string) => {
    setActionError(null);
    disconnectMutation.mutate(toolkit, {
      onError: (cause) =>
        setActionError(
          cause instanceof Error
            ? cause.message
            : "Could not disconnect that app.",
        ),
    });
  };

  const normalizedQuery = query.trim().toLowerCase();

  useEffect(() => {
    const target = loadMoreRef.current;
    if (
      !target ||
      normalizedQuery ||
      !catalogQuery.hasNextPage ||
      catalogQuery.isFetchingNextPage
    )
      return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) void catalogQuery.fetchNextPage();
      },
      { rootMargin: "180px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [
    catalogQuery.fetchNextPage,
    catalogQuery.hasNextPage,
    catalogQuery.isFetchingNextPage,
    normalizedQuery,
  ]);

  const matchingCatalog = useMemo(
    () =>
      normalizedQuery
        ? catalog.filter((item) =>
            `${item.name} ${item.slug}`.toLowerCase().includes(normalizedQuery),
          )
        : catalog,
    [catalog, normalizedQuery],
  );
  const connected = matchingCatalog.filter(
    (item) => item.connection && item.connection.status !== "disconnected",
  );
  const available = matchingCatalog.filter(
    (item) => !item.connection || item.connection.status === "disconnected",
  );
  const initialLoading = catalogQuery.isLoading && catalog.length === 0;
  const error =
    actionError ??
    (catalogQuery.error instanceof Error
      ? catalogQuery.error.message
      : catalogQuery.isError
        ? "Connected apps are unavailable."
        : null);
  const busyToolkit = connectMutation.isPending
    ? connectMutation.variables
    : disconnectMutation.isPending
      ? disconnectMutation.variables
      : null;

  return (
    <section className="connected-apps" aria-busy={catalogQuery.isFetching}>
      <header className="connected-apps-intro">
        <span>Private by default</span>
        <p>
          Connect once. Freestyle can use only your account, and always asks
          before changing anything outside the app.
        </p>
      </header>

      <label className="connector-search" htmlFor="connector-search">
        <span aria-hidden="true">⌕</span>
        <input
          id="connector-search"
          aria-label="Filter loaded connected apps"
          value={query}
          placeholder="Filter loaded apps"
          onChange={(event) => setQuery(event.target.value)}
        />
        {query ? (
          <button
            type="button"
            aria-label="Clear app search"
            onClick={() => setQuery("")}
          >
            ×
          </button>
        ) : null}
      </label>

      {error ? (
        <div className="connector-error" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => void catalogQuery.refetch()}>
            Try again
          </button>
        </div>
      ) : null}

      {initialLoading ? (
        <>
          <p className="connector-loading-copy" role="status">
            Finding your apps…
          </p>
          <ConnectedAppsSkeleton />
        </>
      ) : null}

      {!initialLoading && connected.length > 0 ? (
        <div className="connector-group">
          <div className="connector-group-label">
            <span>Connected</span>
            <em>{connected.length}</em>
          </div>
          {connected.map((connector) => (
            <ConnectorCard
              key={connector.slug}
              connector={connector}
              busy={busyToolkit === connector.slug}
              onConnect={() => connect(connector.slug)}
              onDisconnect={() => disconnect(connector.slug)}
            />
          ))}
        </div>
      ) : null}

      {!initialLoading && available.length > 0 ? (
        <div className="connector-group">
          <div className="connector-group-label">
            <span>{connected.length > 0 ? "More apps" : "Available apps"}</span>
            <em>{available.length}</em>
          </div>
          {available.map((connector) => (
            <ConnectorCard
              key={connector.slug}
              connector={connector}
              busy={busyToolkit === connector.slug}
              onConnect={() => connect(connector.slug)}
              onDisconnect={() => disconnect(connector.slug)}
            />
          ))}
        </div>
      ) : null}

      {!initialLoading && matchingCatalog.length === 0 ? (
        <div className="connector-empty">
          <strong>
            {normalizedQuery ? "No apps found" : "No apps are available"}
          </strong>
          <p>
            {normalizedQuery
              ? "Try a different app name."
              : "Try again in a moment."}
          </p>
          {normalizedQuery ? (
            <button type="button" onClick={() => setQuery("")}>
              Clear search
            </button>
          ) : null}
        </div>
      ) : null}

      {!initialLoading && catalog.length > 0 ? (
        <div
          ref={loadMoreRef}
          className={`connector-load-more${catalogQuery.isFetchingNextPage ? " is-loading" : ""}`}
          role="status"
        >
          {catalogQuery.isFetchingNextPage ? (
            <>
              <span className="connector-load-trail" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <span className="connector-load-copy">
                <strong>Finding more apps</strong>
                <small>Keeping your place in the catalog</small>
              </span>
            </>
          ) : normalizedQuery ? (
            "Filter applies to apps loaded so far."
          ) : catalogQuery.hasNextPage ? (
            "More apps load as you scroll."
          ) : (
            "All available apps loaded."
          )}
        </div>
      ) : null}
    </section>
  );
}
