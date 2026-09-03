import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@renderer/components/ui/dialog";
import {
  type ConnectorAuthField,
  type ConnectorCatalogItem,
  type ConnectorConnection,
  disconnectToolkit,
} from "@renderer/lib/connectors";
import {
  connectorCatalogInfiniteQueryOptions,
  connectorConnectionsQueryOptions,
  connectorSearchInfiniteQueryOptions,
  queryKeys,
} from "@renderer/lib/query";
import {
  type ConnectPhase,
  useConnectorConnect,
} from "@renderer/lib/use-connector-connect";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type React from "react";
import { useEffect, useMemo, useState } from "react";

function SearchIcon(): React.JSX.Element {
  return (
    <svg
      className="connector-search-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="10.8" cy="10.8" r="5.8" />
      <path d="m15.2 15.2 4 4" />
    </svg>
  );
}

export function ConnectorLogo({
  name,
  logo,
  large,
}: {
  name: string;
  logo?: string | null;
  large?: boolean;
}): React.JSX.Element {
  const [failed, setFailed] = useState(false);
  if (!logo || failed)
    return (
      <div
        className={`connector-mark${large ? " is-large" : ""}`}
        aria-hidden="true"
      >
        {name.slice(0, 1)}
      </div>
    );
  return (
    <img
      className={`connector-logo${large ? " is-large" : ""}`}
      src={logo}
      alt=""
      draggable={false}
      onError={() => setFailed(true)}
    />
  );
}

export const DEFAULT_AUTH_FIELDS: ConnectorAuthField[] = [
  { name: "generic_api_key", displayName: "API Key", required: true },
];

function isSecretField(name: string): boolean {
  return /key|token|secret|password/i.test(name);
}

export function ApiKeyForm({
  fields,
  busy,
  onSubmit,
}: {
  fields: ConnectorAuthField[];
  busy: boolean;
  onSubmit: (credentials: Record<string, string>) => void;
}): React.JSX.Element {
  const [values, setValues] = useState<Record<string, string>>({});
  const ready = fields
    .filter((field) => field.required)
    .every((field) => (values[field.name] ?? "").trim().length > 0);

  return (
    <form
      className="connector-keyform"
      onSubmit={(event) => {
        event.preventDefault();
        if (!ready || busy) return;
        const credentials: Record<string, string> = {};
        for (const field of fields) {
          const value = (values[field.name] ?? "").trim();
          if (value) credentials[field.name] = value;
        }
        onSubmit(credentials);
      }}
    >
      {fields.map((field) => (
        <label key={field.name} className="connector-keyfield">
          <span>
            {field.displayName}
            {field.required ? "" : " (optional)"}
          </span>
          <input
            type={isSecretField(field.name) ? "password" : "text"}
            value={values[field.name] ?? ""}
            autoComplete="off"
            spellCheck={false}
            onMouseDown={() => window.api.panelRequestFocus()}
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                [field.name]: event.target.value,
              }))
            }
          />
          {field.description ? <small>{field.description}</small> : null}
        </label>
      ))}
      <button
        type="submit"
        className="connector-action"
        disabled={!ready || busy}
      >
        {busy ? "Connecting…" : "Connect"}
      </button>
    </form>
  );
}

function connectionCopy(
  connection: ConnectorConnection | null,
  phase: ConnectPhase | undefined,
  description?: string,
): string {
  if (phase === "opening") return "Connecting…";
  if (phase === "pending" || connection?.status === "pending")
    return "Finish connecting in your browser";
  if (connection?.status === "active")
    return `${connection.accountLabel ?? "Connected"} · ${connection.toolCount} ${connection.toolCount === 1 ? "tool" : "tools"}`;
  if (connection?.status === "needs_reconnect")
    return "Reconnect to keep using this app";
  return description ?? "Available to Freestyle";
}

function actionLabel(
  connection: ConnectorConnection | null,
  phase: ConnectPhase | undefined,
): string {
  if (connection?.status === "active") return "Disconnect";
  if (phase === "opening") return "Opening…";
  if (phase === "pending" || connection?.status === "pending")
    return "Open browser";
  if (connection?.status === "needs_reconnect") return "Reconnect";
  return "Connect";
}

export function connectorMatchesSearch(
  item: ConnectorCatalogItem,
  query: string,
): boolean {
  const normalized = query.trim().toLocaleLowerCase();
  return [item.name, item.description, ...(item.categories ?? [])]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLocaleLowerCase()
    .includes(normalized);
}

function ConnectorCard({
  connector,
  phase,
  busy,
  onConnect,
  onDisconnect,
  onSetUp,
}: {
  connector: ConnectorCatalogItem;
  phase: ConnectPhase | undefined;
  busy: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  onSetUp: () => void;
}): React.JSX.Element {
  const connection = connector.connection;
  const connected = connection?.status === "active";
  const pending = phase === "pending" || connection?.status === "pending";
  const reconnect = connection?.status === "needs_reconnect";
  const opensCredentials = connector.authMode === "api_key" && !connected;

  return (
    <article
      className={`connector-card${connected ? " is-connected" : ""}${pending ? " is-pending" : ""}${reconnect ? " needs-reconnect" : ""}`}
    >
      <div className="connector-card-open">
        <ConnectorLogo name={connector.name} logo={connector.logo} />
        <div className="connector-card-copy">
          <div className="connector-card-heading">
            <strong>{connector.name}</strong>
          </div>
          <p>{connectionCopy(connection, phase, connector.description)}</p>
          {connection?.statusReason ? (
            <p className="connector-reason">{connection.statusReason}</p>
          ) : null}
        </div>
      </div>
      <div className="connector-card-actions">
        <button
          type="button"
          className="connector-action"
          disabled={busy || phase === "opening"}
          onClick={
            connected ? onDisconnect : opensCredentials ? onSetUp : onConnect
          }
        >
          {busy ? "Working…" : actionLabel(connection, phase)}
        </button>
      </div>
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
  const [apiKeyConnector, setApiKeyConnector] =
    useState<ConnectorCatalogItem | null>(null);
  const queryClient = useQueryClient();
  const {
    connect,
    connectWithCredentials,
    cancel: cancelConnect,
    phases,
    error: connectError,
    clearError,
  } = useConnectorConnect();
  const [actionError, setActionError] = useState<string | null>(null);

  const connectionsQuery = useQuery(connectorConnectionsQueryOptions());
  const browseQuery = useInfiniteQuery(connectorCatalogInfiniteQueryOptions());
  const searchTerm = query.trim();
  const searchQuery = useInfiniteQuery(
    connectorSearchInfiniteQueryOptions(searchTerm),
  );

  const connections = useMemo(
    () =>
      (connectionsQuery.data ?? []).filter(
        (connection) => connection.status !== "disconnected",
      ),
    [connectionsQuery.data],
  );
  const connectedSlugs = useMemo(
    () => new Set(connections.map((connection) => connection.toolkitSlug)),
    [connections],
  );
  const connectedItems: ConnectorCatalogItem[] = useMemo(
    () =>
      connections.map((connection) => ({
        slug: connection.toolkitSlug,
        name: connection.toolkitName,
        logo: connection.toolkitLogo ?? undefined,
        connection,
      })),
    [connections],
  );
  const browse = useMemo(
    () =>
      (browseQuery.data?.pages.flatMap((page) => page.connectors) ?? []).filter(
        (item) => !connectedSlugs.has(item.slug),
      ),
    [browseQuery.data, connectedSlugs],
  );
  const searchResults = useMemo(() => {
    const bySlug = new Map<string, ConnectorCatalogItem>();

    for (const item of connectedItems) {
      if (connectorMatchesSearch(item, searchTerm)) {
        bySlug.set(item.slug, item);
      }
    }
    for (const item of searchQuery.data?.pages.flatMap(
      (page) => page.connectors,
    ) ?? []) {
      if (!bySlug.has(item.slug)) bySlug.set(item.slug, item);
    }
    return [...bySlug.values()];
  }, [connectedItems, searchQuery.data, searchTerm]);

  const disconnectMutation = useMutation({
    mutationFn: disconnectToolkit,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.connectors.all,
      });
    },
  });
  const disconnect = (toolkit: string) => {
    cancelConnect(toolkit);
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
  const startConnect = (toolkit: string) => {
    setActionError(null);
    connect(toolkit);
  };

  const searching = query.trim().length > 0;

  const [loadMoreEl, setLoadMoreEl] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    if (
      !loadMoreEl ||
      searching ||
      !browseQuery.hasNextPage ||
      browseQuery.isFetchingNextPage
    )
      return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) void browseQuery.fetchNextPage();
      },
      { rootMargin: "180px" },
    );
    observer.observe(loadMoreEl);
    return () => observer.disconnect();
  }, [
    loadMoreEl,
    browseQuery.fetchNextPage,
    browseQuery.hasNextPage,
    browseQuery.isFetchingNextPage,
    searching,
  ]);

  // Present the directory as one coherent surface rather than letting each
  // source shift the page as it happens to arrive.
  const initialLoading = connectionsQuery.isLoading || browseQuery.isLoading;
  const error =
    actionError ??
    connectError ??
    (browseQuery.error instanceof Error
      ? browseQuery.error.message
      : browseQuery.isError || searchQuery.isError || connectionsQuery.isError
        ? "Connected apps are unavailable."
        : null);
  const busyDisconnect = disconnectMutation.isPending
    ? disconnectMutation.variables
    : null;

  const renderCards = (items: ConnectorCatalogItem[]) =>
    items.map((connector) => (
      <ConnectorCard
        key={connector.slug}
        connector={connector}
        phase={phases[connector.slug]}
        busy={busyDisconnect === connector.slug}
        onConnect={() => startConnect(connector.slug)}
        onDisconnect={() => disconnect(connector.slug)}
        onSetUp={() => setApiKeyConnector(connector)}
      />
    ));

  return (
    <section
      className="connected-apps"
      aria-busy={
        connectionsQuery.isFetching ||
        browseQuery.isFetching ||
        searchQuery.isFetching
      }
    >
      <label className="connector-search" htmlFor="connector-search">
        <SearchIcon />
        <input
          id="connector-search"
          aria-label="Search all apps"
          value={query}
          placeholder="Search 1,000+ apps"
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
          <button
            type="button"
            onClick={() => {
              setActionError(null);
              clearError();
              void browseQuery.refetch();
              void connectionsQuery.refetch();
              if (searching) void searchQuery.refetch();
            }}
          >
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

      {searching ? (
        <div className="connector-group">
          <div className="connector-group-label">
            <span>Results</span>
            <em>{searchResults.length}</em>
          </div>
          {searchQuery.isLoading && searchResults.length === 0 ? (
            <ConnectedAppsSkeleton />
          ) : searchResults.length > 0 ? (
            <>
              {renderCards(searchResults)}
              {searchQuery.hasNextPage ? (
                <button
                  type="button"
                  className="connector-load-more"
                  disabled={searchQuery.isFetchingNextPage}
                  onClick={() => void searchQuery.fetchNextPage()}
                >
                  {searchQuery.isFetchingNextPage
                    ? "Loading more…"
                    : "Load more"}
                </button>
              ) : null}
            </>
          ) : (
            <div className="connector-empty">
              <strong>No apps found</strong>
              <p>Try a different app name.</p>
              <button type="button" onClick={() => setQuery("")}>
                Clear search
              </button>
            </div>
          )}
        </div>
      ) : (
        <>
          {!initialLoading && connectedItems.length > 0 ? (
            <div className="connector-group">
              <div className="connector-group-label">
                <span>Connected</span>
                <em>{connectedItems.length}</em>
              </div>
              {renderCards(connectedItems)}
            </div>
          ) : null}

          {!initialLoading && browse.length > 0 ? (
            <div className="connector-group">
              <div className="connector-group-label">
                <span>All apps</span>
              </div>
              {renderCards(browse)}
            </div>
          ) : null}

          {!initialLoading && browse.length > 0 ? (
            <div
              ref={setLoadMoreEl}
              className={`connector-load-more${browseQuery.isFetchingNextPage ? " is-loading" : ""}`}
              role="status"
            >
              {browseQuery.isFetchingNextPage ? (
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
              ) : browseQuery.hasNextPage ? (
                "More apps load as you scroll — or search to jump straight there."
              ) : (
                "All available apps loaded."
              )}
            </div>
          ) : null}
        </>
      )}
      <Dialog
        open={apiKeyConnector !== null}
        onOpenChange={(open) => {
          if (!open) setApiKeyConnector(null);
        }}
      >
        <DialogContent className="connector-credentials-dialog">
          <DialogHeader>
            <DialogTitle>Connect {apiKeyConnector?.name ?? "app"}</DialogTitle>
            <DialogDescription>
              Enter the credentials from your account to let Remix use this app.
            </DialogDescription>
          </DialogHeader>
          {apiKeyConnector ? (
            <ApiKeyForm
              fields={apiKeyConnector.authFields ?? DEFAULT_AUTH_FIELDS}
              busy={phases[apiKeyConnector.slug] === "opening"}
              onSubmit={(credentials) => {
                setActionError(null);
                connectWithCredentials(apiKeyConnector.slug, credentials);
                setApiKeyConnector(null);
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}
