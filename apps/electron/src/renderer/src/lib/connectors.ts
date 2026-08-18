import { capture } from "@renderer/lib/analytics";
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

export type ConnectorWorkflow = { name: string; prompt: string };

export type ConnectorAuthMode = "oauth" | "api_key";

export type ConnectorAuthField = {
  name: string;
  displayName: string;
  description?: string;
  required: boolean;
};

export type ConnectorCatalogItem = {
  slug: string;
  name: string;
  logo?: string;
  description?: string;
  categories?: string[];
  toolsCount?: number;
  triggersCount?: number;
  appUrl?: string;
  authMode?: ConnectorAuthMode;
  authFields?: ConnectorAuthField[];
  workflows?: ConnectorWorkflow[];
  connection: ConnectorConnection | null;
};

export type ConnectorCatalogPage = {
  connectors: ConnectorCatalogItem[];
  nextCursor: string | null;
  totalItems?: number | null;
};

export type ConnectorToolSummary = {
  name: string;
  description?: string;
  readOnly: boolean;
};

export type ConnectorPlay = {
  name: string;
  description: string;
  prompt: string;
};

export type ConnectorAutomation = {
  id: string;
  name: string;
  schedule: string;
};

export type ConnectorDetails = ConnectorCatalogItem & {
  tools: ConnectorToolSummary[];
  workflows: ConnectorWorkflow[];
  plays?: ConnectorPlay[];
  automations?: ConnectorAutomation[];
};

export function isConnectorToolName(name: string): boolean {
  return /^connector__[a-zA-Z0-9_-]+__(?:ro_)?[a-zA-Z0-9_]+$/.test(name);
}

export function connectorToolActionName(
  toolName: string,
  input?: unknown,
): string {
  const slug =
    input && typeof input === "object"
      ? (input as { tool_slug?: unknown }).tool_slug
      : undefined;
  if (typeof slug === "string" && /^[A-Z0-9_]+$/.test(slug)) return slug;
  const encoded = (toolName.split("__").at(-1) ?? "").replace(/^ro_/, "");
  if (!/^(?:[0-9a-f]{2})+$/i.test(encoded)) return encoded;
  try {
    return new TextDecoder().decode(
      Uint8Array.from(encoded.match(/.{2}/g) ?? [], (byte) =>
        parseInt(byte, 16),
      ),
    );
  } catch {
    return encoded;
  }
}

async function responseJson<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => null)) as
    | { error?: string }
    | T
    | null;
  if (!response.ok) {
    const error = (payload as { error?: string } | null)?.error;
    const friendlyError =
      error === "cloud_auth_required"
        ? "Sign in to Freestyle before connecting an app."
        : error === "connected_apps_unavailable"
          ? "Connected apps are temporarily unavailable. Please try again."
          : error;
    throw new Error(friendlyError ?? "Connected apps are unavailable.");
  }
  return payload as T;
}

export async function listConnectorCatalog({
  cursor,
  limit = 24,
  search,
}: {
  cursor?: string;
  limit?: number;
  search?: string;
} = {}): Promise<ConnectorCatalogPage> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor) params.set("cursor", cursor);
  if (search) params.set("search", search);
  return responseJson<ConnectorCatalogPage>(
    await apiFetch(`/api/connectors/catalog?${params.toString()}`),
  );
}

export async function listConnectorConnections(): Promise<
  ConnectorConnection[]
> {
  const data = await responseJson<{ connections: ConnectorConnection[] }>(
    await apiFetch("/api/connectors"),
  );
  return data.connections;
}

export type SuggestedConnectors = {
  connectors: ConnectorCatalogItem[];
  heading: string;
};

export async function listSuggestedConnectors(): Promise<SuggestedConnectors> {
  const data = await responseJson<{
    connectors: ConnectorCatalogItem[];
    heading?: string;
  }>(await apiFetch("/api/connectors/suggested"));
  return {
    connectors: data.connectors,
    heading: data.heading ?? "Suggested",
  };
}

export async function getConnectorDetails(
  toolkit: string,
): Promise<ConnectorDetails> {
  return responseJson<ConnectorDetails>(
    await apiFetch(`/api/connectors/${encodeURIComponent(toolkit)}/details`),
  );
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

export async function connectToolkitWithCredentials(
  toolkit: string,
  credentials: Record<string, string>,
): Promise<ConnectorConnection | null> {
  const data = await responseJson<{ connection: ConnectorConnection | null }>(
    await apiFetch(`/api/connectors/${encodeURIComponent(toolkit)}/connect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ credentials }),
    }),
  );
  return data.connection;
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
  capture("connector_disconnected", { toolkit });
}
