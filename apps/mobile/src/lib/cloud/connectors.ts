import { cloud } from "./client";

export type ConnectorStatus =
  | "pending"
  | "active"
  | "needs_reconnect"
  | "disconnected";

export type ConnectorConnection = {
  id: string;
  toolkitSlug: string;
  toolkitName: string;
  toolkitLogo: string | null;
  accountLabel: string | null;
  toolCount: number;
  status: ConnectorStatus;
  statusReason: string | null;
};

export type ConnectorCatalogItem = {
  slug: string;
  name: string;
  logo?: string;
  description?: string;
  categories?: string[];
  toolsCount?: number;
  authMode?: "oauth" | "api_key";
  authFields?: Array<{
    name: string;
    displayName: string;
    description?: string;
    required: boolean;
  }>;
  connection: ConnectorConnection | null;
};

export type ConnectorCatalogPage = {
  connectors: ConnectorCatalogItem[];
  nextCursor: string | null;
};

export async function listConnectorCatalog({
  cursor,
  search,
  limit = 24,
}: {
  cursor?: string;
  search?: string;
  limit?: number;
} = {}): Promise<ConnectorCatalogPage> {
  const params = new URLSearchParams({ limit: String(Math.min(limit, 50)) });
  if (cursor) params.set("cursor", cursor);
  if (search?.trim()) params.set("search", search.trim());
  return cloud.json<ConnectorCatalogPage>(`/v2/connectors/catalog?${params}`);
}

export async function listConnectorConnections(): Promise<
  ConnectorConnection[]
> {
  const data = await cloud.json<{ connections: ConnectorConnection[] }>(
    "/v2/connectors",
  );
  return data.connections;
}

/** Starts the browser OAuth handshake. The caller owns opening the URL. */
export async function connectToolkit(toolkit: string): Promise<string> {
  const data = await cloud.json<{ connectUrl: string }>(
    `/v2/connectors/${encodeURIComponent(toolkit)}/connect`,
    { method: "POST" },
  );
  return data.connectUrl;
}

export async function connectToolkitWithCredentials(
  toolkit: string,
  credentials: Record<string, string>,
): Promise<ConnectorConnection | null> {
  const data = await cloud.json<{ connection: ConnectorConnection | null }>(
    `/v2/connectors/${encodeURIComponent(toolkit)}/connect`,
    { method: "POST", json: { credentials } },
  );
  return data.connection;
}

export async function disconnectToolkit(toolkit: string): Promise<void> {
  await cloud.json(`/v2/connectors/${encodeURIComponent(toolkit)}/disconnect`, {
    method: "POST",
  });
}
