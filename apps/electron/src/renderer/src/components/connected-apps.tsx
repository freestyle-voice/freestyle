import {
  type ConnectorAuthField,
  type ConnectorCatalogItem,
  type ConnectorConnection,
  disconnectToolkit,
} from "@renderer/lib/connectors";
import {
  connectorCatalogInfiniteQueryOptions,
  connectorConnectionsQueryOptions,
  connectorDetailsQueryOptions,
  connectorSearchQueryOptions,
  connectorSuggestedQueryOptions,
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
import { useEffect, useMemo, useRef, useState } from "react";

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

function connectionBadge(
  connection: ConnectorConnection | null,
  phase: ConnectPhase | undefined,
): string | null {
  if (phase === "pending") return "In progress";
  switch (connection?.status) {
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

function ConnectorCard({
  connector,
  phase,
  busy,
  onConnect,
  onDisconnect,
  onOpen,
}: {
  connector: ConnectorCatalogItem;
  phase: ConnectPhase | undefined;
  busy: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  onOpen: () => void;
}): React.JSX.Element {
  const connection = connector.connection;
  const connected = connection?.status === "active";
  const pending = phase === "pending" || connection?.status === "pending";
  const reconnect = connection?.status === "needs_reconnect";
  // API-key apps collect credentials in the detail pane, so Connect opens it.
  const opensDetail = connector.authMode === "api_key" && !connected;

  return (
    <article
      className={`connector-card${connected ? " is-connected" : ""}${pending ? " is-pending" : ""}${reconnect ? " needs-reconnect" : ""}`}
    >
      <button
        type="button"
        className="connector-card-open"
        aria-label={`About ${connector.name}`}
        onClick={onOpen}
      >
        <ConnectorLogo name={connector.name} logo={connector.logo} />
        <div className="connector-card-copy">
          <div className="connector-card-heading">
            <strong>{connector.name}</strong>
            {connectionBadge(connection, phase) ? (
              <span className="connector-state">
                {connectionBadge(connection, phase)}
              </span>
            ) : null}
          </div>
          <p>{connectionCopy(connection, phase, connector.description)}</p>
          {connection?.statusReason ? (
            <p className="connector-reason">{connection.statusReason}</p>
          ) : null}
        </div>
      </button>
      <div className="connector-card-actions">
        <button
          type="button"
          className={`connector-action${connected ? " is-secondary" : ""}`}
          disabled={busy || phase === "opening"}
          onClick={connected ? onDisconnect : opensDetail ? onOpen : onConnect}
        >
          {busy && !connected ? "Opening…" : actionLabel(connection, phase)}
        </button>
        {pending || reconnect ? (
          <button
            type="button"
            className="connector-cancel"
            disabled={busy}
            onClick={onDisconnect}
          >
            {pending ? "Cancel" : "Remove"}
          </button>
        ) : null}
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

function ConnectorDetail({
  slug,
  phase,
  busyDisconnect,
  onBack,
  onConnect,
  onConnectWithKey,
  onDisconnect,
  onUseWorkflow,
  actionError,
}: {
  slug: string;
  phase: ConnectPhase | undefined;
  busyDisconnect: boolean;
  onBack: () => void;
  onConnect: () => void;
  onConnectWithKey: (credentials: Record<string, string>) => void;
  onDisconnect: () => void;
  onUseWorkflow?: (prompt: string) => void;
  actionError?: string | null;
}): React.JSX.Element {
  const detailsQuery = useQuery(connectorDetailsQueryOptions(slug));
  const details = detailsQuery.data;
  const connection = details?.connection ?? null;
  const connected = connection?.status === "active";

  return (
    <section className="connector-detail">
      <button type="button" className="connector-detail-back" onClick={onBack}>
        ‹ Apps
      </button>

      {actionError ? (
        <div className="connector-error" role="alert">
          <span>{actionError}</span>
        </div>
      ) : null}

      {detailsQuery.isLoading ? (
        <ConnectedAppsSkeleton />
      ) : detailsQuery.isError || !details ? (
        <div className="connector-error" role="alert">
          <span>That app's details are unavailable right now.</span>
          <button type="button" onClick={() => void detailsQuery.refetch()}>
            Try again
          </button>
        </div>
      ) : (
        <>
          <header className="connector-detail-head">
            <ConnectorLogo name={details.name} logo={details.logo} large />
            <div className="connector-detail-title">
              <div className="connector-card-heading">
                <strong>{details.name}</strong>
                {connectionBadge(connection, phase) ? (
                  <span className="connector-state">
                    {connectionBadge(connection, phase)}
                  </span>
                ) : null}
              </div>
              {details.description ? <p>{details.description}</p> : null}
            </div>
          </header>

          <div className="connector-detail-meta">
            {details.categories?.map((category) => (
              <span key={category} className="connector-chip">
                {category}
              </span>
            ))}
            {details.toolsCount ? (
              <span className="connector-chip is-muted">
                {details.toolsCount} tools
              </span>
            ) : null}
            {details.appUrl ? (
              <button
                type="button"
                className="connector-chip is-link"
                onClick={() => void window.api.openExternal(details.appUrl!)}
              >
                Website ↗
              </button>
            ) : null}
          </div>

          {details.authMode === "api_key" && !connected ? (
            <div className="connector-detail-keyform">
              <p className="connector-detail-status">
                This app connects with an API key from your account. It goes
                straight to the cloud and is never stored on this device.
              </p>
              <ApiKeyForm
                fields={details.authFields ?? DEFAULT_AUTH_FIELDS}
                busy={phase === "opening"}
                onSubmit={onConnectWithKey}
              />
            </div>
          ) : (
            <div className="connector-detail-actions">
              <button
                type="button"
                className={`connector-action connector-detail-action${connected ? " is-secondary" : ""}`}
                disabled={busyDisconnect || phase === "opening"}
                onClick={connected ? onDisconnect : onConnect}
              >
                {actionLabel(connection, phase)}
              </button>
              {phase === "pending" ||
              connection?.status === "pending" ||
              connection?.status === "needs_reconnect" ? (
                <button
                  type="button"
                  className="connector-cancel"
                  disabled={busyDisconnect}
                  onClick={onDisconnect}
                >
                  {connection?.status === "needs_reconnect" &&
                  phase !== "pending"
                    ? "Remove"
                    : "Cancel"}
                </button>
              ) : null}
            </div>
          )}
          {details.authMode === "api_key" && !connected ? null : (
            <p className="connector-detail-status">
              {connectionCopy(connection, phase)}
            </p>
          )}

          {details.workflows.length > 0 ? (
            <div className="connector-detail-section">
              <div className="connector-group-label">
                <span>Things to try</span>
              </div>
              <div className="connector-workflows">
                {details.workflows.map((workflow) => (
                  <button
                    key={workflow.name}
                    type="button"
                    className="connector-workflow"
                    disabled={!onUseWorkflow}
                    title={workflow.prompt}
                    onClick={() => onUseWorkflow?.(workflow.prompt)}
                  >
                    <strong>{workflow.name}</strong>
                    <small>{workflow.prompt}</small>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {details.tools.length > 0 ? (
            <div className="connector-detail-section">
              <div className="connector-group-label">
                <span>What it can do</span>
                <em>{details.tools.length}</em>
              </div>
              <ul className="connector-tools">
                {details.tools.map((tool) => (
                  <li key={tool.name}>
                    <strong>
                      {tool.name}
                      {tool.readOnly ? (
                        <span className="connector-tool-ro">read-only</span>
                      ) : null}
                    </strong>
                    {tool.description ? <p>{tool.description}</p> : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

export function ConnectedApps({
  onUseWorkflow,
}: {
  onUseWorkflow?: (prompt: string) => void;
}): React.JSX.Element {
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [detailSlug, setDetailSlug] = useState<string | null>(null);
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
  const loadMoreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(query.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  const connectionsQuery = useQuery(connectorConnectionsQueryOptions());
  const suggestedQuery = useQuery(connectorSuggestedQueryOptions());
  const browseQuery = useInfiniteQuery(connectorCatalogInfiniteQueryOptions());
  const searchQuery = useQuery(connectorSearchQueryOptions(search));

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
  const suggested = useMemo(
    () =>
      (suggestedQuery.data?.connectors ?? []).filter(
        (item) => !connectedSlugs.has(item.slug),
      ),
    [suggestedQuery.data, connectedSlugs],
  );
  const suggestedHeading = suggestedQuery.data?.heading ?? "Suggested";
  const suggestedSlugs = useMemo(
    () =>
      new Set((suggestedQuery.data?.connectors ?? []).map((item) => item.slug)),
    [suggestedQuery.data],
  );
  const browse = useMemo(
    () =>
      (browseQuery.data?.pages.flatMap((page) => page.connectors) ?? []).filter(
        (item) =>
          !connectedSlugs.has(item.slug) && !suggestedSlugs.has(item.slug),
      ),
    [browseQuery.data, connectedSlugs, suggestedSlugs],
  );
  const searchResults = useMemo(
    () => searchQuery.data?.connectors ?? [],
    [searchQuery.data],
  );

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

  const searching = search.length > 0;

  useEffect(() => {
    const target = loadMoreRef.current;
    if (
      !target ||
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
    observer.observe(target);
    return () => observer.disconnect();
  }, [
    browseQuery.fetchNextPage,
    browseQuery.hasNextPage,
    browseQuery.isFetchingNextPage,
    searching,
  ]);

  const initialLoading =
    (suggestedQuery.isLoading || connectionsQuery.isLoading) &&
    connectedItems.length === 0 &&
    suggested.length === 0;
  const error =
    actionError ??
    connectError ??
    (browseQuery.error instanceof Error
      ? browseQuery.error.message
      : browseQuery.isError ||
          suggestedQuery.isError ||
          connectionsQuery.isError
        ? "Connected apps are unavailable."
        : null);
  const busyDisconnect = disconnectMutation.isPending
    ? disconnectMutation.variables
    : null;

  if (detailSlug) {
    return (
      <ConnectorDetail
        slug={detailSlug}
        phase={phases[detailSlug]}
        busyDisconnect={busyDisconnect === detailSlug}
        onBack={() => setDetailSlug(null)}
        onConnect={() => startConnect(detailSlug)}
        onConnectWithKey={(credentials) => {
          setActionError(null);
          connectWithCredentials(detailSlug, credentials);
        }}
        onDisconnect={() => disconnect(detailSlug)}
        onUseWorkflow={onUseWorkflow}
        actionError={actionError ?? connectError}
      />
    );
  }

  const renderCards = (items: ConnectorCatalogItem[]) =>
    items.map((connector) => (
      <ConnectorCard
        key={connector.slug}
        connector={connector}
        phase={phases[connector.slug]}
        busy={busyDisconnect === connector.slug}
        onConnect={() => startConnect(connector.slug)}
        onDisconnect={() => disconnect(connector.slug)}
        onOpen={() => setDetailSlug(connector.slug)}
      />
    ));

  return (
    <section className="connected-apps" aria-busy={browseQuery.isFetching}>
      <label className="connector-search" htmlFor="connector-search">
        <span aria-hidden="true">⌕</span>
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
              void suggestedQuery.refetch();
              void connectionsQuery.refetch();
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
          {searchQuery.isLoading ? (
            <ConnectedAppsSkeleton />
          ) : searchResults.length > 0 ? (
            renderCards(searchResults)
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

          {!initialLoading && suggested.length > 0 ? (
            <div className="connector-group">
              <div className="connector-group-label">
                <span>{suggestedHeading}</span>
              </div>
              {renderCards(suggested)}
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
              ref={loadMoreRef}
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
    </section>
  );
}
