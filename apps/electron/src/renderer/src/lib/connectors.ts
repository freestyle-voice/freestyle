import { apiFetch } from "@renderer/lib/api";

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
  connection: ConnectorConnection | null;
};

export function isConnectorToolName(name: string): boolean {
  return /^connector__[a-zA-Z0-9_-]+__[a-zA-Z0-9_]+$/.test(name);
}

async function responseJson<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => null)) as
    | { error?: string }
    | T
    | null;
  if (!response.ok)
    throw new Error(
      (payload as { error?: string } | null)?.error ??
        "Connected apps are unavailable.",
    );
  return payload as T;
}

export async function listConnectorCatalog(
  query = "",
): Promise<ConnectorCatalogItem[]> {
  const data = await responseJson<{ connectors: ConnectorCatalogItem[] }>(
    await apiFetch(`/api/connectors/catalog?q=${encodeURIComponent(query)}`),
  );
  return data.connectors;
}

export async function connectToolkit(toolkit: string): Promise<void> {
  const data = await responseJson<{ connectUrl: string }>(
    await apiFetch(`/api/connectors/${encodeURIComponent(toolkit)}/connect`, {
      method: "POST",
    }),
  );
  const opened = await window.api.openExternal(data.connectUrl);
  if (!opened)
    throw new Error("Could not open your browser to connect this app.");
}

export async function connectorStatus(
  toolkit: string,
): Promise<ConnectorConnection | null> {
  const data = await responseJson<{ connection: ConnectorConnection | null }>(
    await apiFetch(`/api/connectors/${encodeURIComponent(toolkit)}/status`),
  );
  return data.connection;
}

export async function disconnectToolkit(toolkit: string): Promise<void> {
  await responseJson(
    await apiFetch(
      `/api/connectors/${encodeURIComponent(toolkit)}/disconnect`,
      { method: "POST" },
    ),
  );
}

export async function approveConnectorAction(input: {
  threadId: string;
  toolName: string;
  input: Record<string, unknown>;
}): Promise<{ approvalToken: string }> {
  return responseJson(
    await apiFetch("/api/connectors/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}

export async function executeConnectorAction(input: {
  approvalToken: string;
  threadId: string;
  toolName: string;
  input: Record<string, unknown>;
}): Promise<Record<string, unknown>> {
  const data = await responseJson<{
    ok: true;
    output: Record<string, unknown>;
  }>(
    await apiFetch("/api/connectors/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
  return data.output;
}
