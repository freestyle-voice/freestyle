import type { DatabaseSync } from "node:sqlite";
import {
  type McpConnectionInput,
  type McpConnectionSummary,
  mcpConnectionInputSchema,
  mcpConnectionSummarySchema,
} from "@freestyle-voice/validations";
import { getDb } from "../db.js";

type McpSecret =
  | { env: Record<string, string> }
  | { bearerToken: string }
  | { headers: Record<string, string> }
  | Record<string, never>;

export type StoredMcpConnection = {
  id: string;
  numericId: number;
  name: string;
  transport: "stdio" | "http";
  url: string | null;
  command: string | null;
  args: string[];
  cwd: string | null;
  enabled: boolean;
  authType: "none" | "bearer" | "headers" | "oauth";
  secret: McpSecret;
  lastError: string | null;
  updatedAt: number;
};

export type StoredMcpTool = {
  originalName: string;
  wireName: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

export type StoredMcpOAuth = {
  tokens?: Record<string, unknown>;
  clientInformation?: Record<string, unknown>;
  codeVerifier?: string;
  state?: string;
  stateExpiresAt?: number;
  discovery?: Record<string, unknown>;
};

type ConnectionRow = {
  id: number;
  name: string;
  transport: "stdio" | "http";
  endpoint: string | null;
  command: string | null;
  args_json: string;
  cwd: string | null;
  enabled: number;
  auth_type: "none" | "bearer" | "headers" | "oauth";
  secret_json: string;
  last_error: string | null;
  updated_at: number;
  tool_count?: number;
  oauth_tokens_json?: string | null;
  oauth_state?: string | null;
  oauth_state_expires_at?: number | null;
};

type OAuthRow = {
  tokens_json: string | null;
  client_information_json: string | null;
  code_verifier: string | null;
  state: string | null;
  state_expires_at: number | null;
  discovery_json: string | null;
};

function externalId(id: number): string {
  return `mcp_${id}`;
}

function numericId(id: string): number | undefined {
  const match = /^mcp_([1-9][0-9]*)$/.exec(id);
  return match ? Number(match[1]) : undefined;
}

function parseRecord(
  value: string | null | undefined,
): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function parseStringArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) &&
      parsed.every((entry) => typeof entry === "string")
      ? parsed
      : [];
  } catch {
    return [];
  }
}

function asStringRecord(
  value: Record<string, unknown>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

function safeSecret(row: ConnectionRow): McpSecret {
  const secret = parseRecord(row.secret_json);
  if (row.transport === "stdio")
    return {
      env: asStringRecord(parseRecord(JSON.stringify(secret.env ?? {}))),
    };
  if (row.auth_type === "bearer" && typeof secret.bearerToken === "string") {
    return { bearerToken: secret.bearerToken };
  }
  if (row.auth_type === "headers") {
    return {
      headers: asStringRecord(
        parseRecord(JSON.stringify(secret.headers ?? {})),
      ),
    };
  }
  return {};
}

function toStored(row: ConnectionRow): StoredMcpConnection {
  return {
    id: externalId(row.id),
    numericId: row.id,
    name: row.name,
    transport: row.transport,
    url: row.endpoint,
    command: row.command,
    args: parseStringArray(row.args_json),
    cwd: row.cwd,
    enabled: row.enabled === 1,
    authType: row.auth_type,
    secret: safeSecret(row),
    lastError: row.last_error,
    updatedAt: row.updated_at,
  };
}

function toSummary(row: ConnectionRow): McpConnectionSummary {
  const hasOAuthTokens =
    Object.keys(parseRecord(row.oauth_tokens_json)).length > 0;
  const oauthPending =
    typeof row.oauth_state === "string" &&
    typeof row.oauth_state_expires_at === "number" &&
    row.oauth_state_expires_at > Date.now();
  return mcpConnectionSummarySchema.parse({
    id: externalId(row.id),
    name: row.name,
    transport: row.transport,
    url: row.endpoint,
    enabled: row.enabled === 1,
    authType: row.auth_type,
    authStatus:
      row.auth_type === "oauth"
        ? oauthPending
          ? "pending"
          : hasOAuthTokens
            ? "connected"
            : row.last_error
              ? "failed"
              : "not_connected"
        : row.last_error
          ? "failed"
          : "not_required",
    toolCount: row.tool_count ?? 0,
    lastError: row.last_error,
    updatedAt: row.updated_at,
  });
}

function secretFor(input: McpConnectionInput): McpSecret {
  if (input.transport === "stdio") return { env: input.env ?? {} };
  if (input.authType === "bearer") return { bearerToken: input.bearerToken! };
  if (input.authType === "headers") return { headers: input.headers! };
  return {};
}

export function createMcpStore(db: DatabaseSync = getDb()) {
  const findRow = (id: string): ConnectionRow | undefined => {
    const numeric = numericId(id);
    if (!numeric) return undefined;
    return db
      .prepare("SELECT * FROM mcp_connections WHERE id = ?")
      .get(numeric) as ConnectionRow | undefined;
  };

  return {
    list(): McpConnectionSummary[] {
      const rows = db
        .prepare(
          `SELECT c.*, COUNT(t.original_name) AS tool_count,
                  o.tokens_json AS oauth_tokens_json,
                  o.state AS oauth_state,
                  o.state_expires_at AS oauth_state_expires_at
             FROM mcp_connections c
             LEFT JOIN mcp_tools t ON t.connection_id = c.id
             LEFT JOIN mcp_oauth o ON o.connection_id = c.id
             GROUP BY c.id
             ORDER BY c.updated_at DESC, c.id DESC`,
        )
        .all() as ConnectionRow[];
      return rows.map(toSummary);
    },

    create(raw: McpConnectionInput): McpConnectionSummary {
      const input = mcpConnectionInputSchema.parse(raw);
      const now = Date.now();
      const authType =
        input.transport === "stdio" ? "none" : (input.authType ?? "none");
      const result = db
        .prepare(
          `INSERT INTO mcp_connections
            (name, transport, endpoint, command, args_json, cwd, enabled, auth_type, secret_json, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          input.name,
          input.transport,
          input.transport === "http" ? (input.url ?? null) : null,
          input.transport === "stdio" ? (input.command ?? null) : null,
          JSON.stringify(input.transport === "stdio" ? (input.args ?? []) : []),
          input.transport === "stdio" ? (input.cwd ?? null) : null,
          input.enabled ? 1 : 0,
          authType,
          JSON.stringify(secretFor(input)),
          now,
          now,
        );
      const row = db
        .prepare("SELECT * FROM mcp_connections WHERE id = ?")
        .get(Number(result.lastInsertRowid)) as ConnectionRow;
      return toSummary(row);
    },

    getPrivate(id: string): StoredMcpConnection | undefined {
      const row = findRow(id);
      return row ? toStored(row) : undefined;
    },

    remove(id: string): boolean {
      const numeric = numericId(id);
      if (!numeric) return false;
      return (
        db.prepare("DELETE FROM mcp_connections WHERE id = ?").run(numeric)
          .changes > 0
      );
    },

    saveTools(connectionId: string, tools: StoredMcpTool[]): void {
      const numeric = numericId(connectionId);
      if (!numeric) return;
      const now = Date.now();
      const insert = db.prepare(
        `INSERT INTO mcp_tools
          (connection_id, original_name, wire_name, description, input_schema_json, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      );
      // Re-discovery replaces a cache. Keep the previous cache intact if a
      // database constraint rejects any member of the new response.
      db.exec("BEGIN");
      try {
        db.prepare("DELETE FROM mcp_tools WHERE connection_id = ?").run(
          numeric,
        );
        for (const tool of tools) {
          insert.run(
            numeric,
            tool.originalName,
            tool.wireName,
            tool.description,
            JSON.stringify(tool.inputSchema),
            now,
          );
        }
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },

    getTools(connectionId: string): StoredMcpTool[] {
      const numeric = numericId(connectionId);
      if (!numeric) return [];
      return (
        db
          .prepare(
            `SELECT original_name, wire_name, description, input_schema_json
               FROM mcp_tools WHERE connection_id = ? ORDER BY original_name`,
          )
          .all(numeric) as {
          original_name: string;
          wire_name: string;
          description: string;
          input_schema_json: string;
        }[]
      ).map((row) => ({
        originalName: row.original_name,
        wireName: row.wire_name,
        description: row.description,
        inputSchema: parseRecord(row.input_schema_json),
      }));
    },

    listEnabledTools(): Array<{
      connection: StoredMcpConnection;
      tool: StoredMcpTool;
    }> {
      const rows = db
        .prepare(
          `SELECT c.*, t.original_name, t.wire_name, t.description, t.input_schema_json
             FROM mcp_connections c
             JOIN mcp_tools t ON t.connection_id = c.id
            WHERE c.enabled = 1
            ORDER BY c.id, t.original_name`,
        )
        .all() as Array<
        ConnectionRow & {
          original_name: string;
          wire_name: string;
          description: string;
          input_schema_json: string;
        }
      >;
      return rows.map((row) => ({
        connection: toStored(row),
        tool: {
          originalName: row.original_name,
          wireName: row.wire_name,
          description: row.description,
          inputSchema: parseRecord(row.input_schema_json),
        },
      }));
    },

    /** Count the Cloud-visible tool surface before enabling another server. */
    enabledToolCount(excludingConnectionId?: string): number {
      const excluded = excludingConnectionId
        ? numericId(excludingConnectionId)
        : undefined;
      const row = (
        excluded
          ? db
              .prepare(
                `SELECT COUNT(*) AS count
                   FROM mcp_tools t
                   JOIN mcp_connections c ON c.id = t.connection_id
                  WHERE c.enabled = 1 AND c.id != ?`,
              )
              .get(excluded)
          : db
              .prepare(
                `SELECT COUNT(*) AS count
                   FROM mcp_tools t
                   JOIN mcp_connections c ON c.id = t.connection_id
                  WHERE c.enabled = 1`,
              )
              .get()
      ) as { count: number };
      return row.count;
    },

    findTool(
      wireName: string,
    ): { connection: StoredMcpConnection; tool: StoredMcpTool } | undefined {
      const row = db
        .prepare(
          `SELECT c.*, t.original_name, t.wire_name, t.description, t.input_schema_json
             FROM mcp_tools t
             JOIN mcp_connections c ON c.id = t.connection_id
            WHERE t.wire_name = ?`,
        )
        .get(wireName) as
        | (ConnectionRow & {
            original_name: string;
            wire_name: string;
            description: string;
            input_schema_json: string;
          })
        | undefined;
      if (!row) return undefined;
      return {
        connection: toStored(row),
        tool: {
          originalName: row.original_name,
          wireName: row.wire_name,
          description: row.description,
          inputSchema: parseRecord(row.input_schema_json),
        },
      };
    },

    saveOAuth(connectionId: string, oauth: StoredMcpOAuth): void {
      const numeric = numericId(connectionId);
      if (!numeric) return;
      const current = this.getOAuth(connectionId) ?? {};
      const next = { ...current, ...oauth };
      db.prepare(
        `INSERT INTO mcp_oauth
          (connection_id, tokens_json, client_information_json, code_verifier, state, state_expires_at, discovery_json, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(connection_id) DO UPDATE SET
           tokens_json = excluded.tokens_json,
           client_information_json = excluded.client_information_json,
           code_verifier = excluded.code_verifier,
           state = excluded.state,
           state_expires_at = excluded.state_expires_at,
           discovery_json = excluded.discovery_json,
           updated_at = excluded.updated_at`,
      ).run(
        numeric,
        next.tokens ? JSON.stringify(next.tokens) : null,
        next.clientInformation ? JSON.stringify(next.clientInformation) : null,
        next.codeVerifier ?? null,
        next.state ?? null,
        next.stateExpiresAt ?? null,
        next.discovery ? JSON.stringify(next.discovery) : null,
        Date.now(),
      );
    },

    getOAuth(connectionId: string): StoredMcpOAuth | undefined {
      const numeric = numericId(connectionId);
      if (!numeric) return undefined;
      const row = db
        .prepare("SELECT * FROM mcp_oauth WHERE connection_id = ?")
        .get(numeric) as OAuthRow | undefined;
      if (!row) return undefined;
      return {
        ...(row.tokens_json ? { tokens: parseRecord(row.tokens_json) } : {}),
        ...(row.client_information_json
          ? { clientInformation: parseRecord(row.client_information_json) }
          : {}),
        ...(row.code_verifier ? { codeVerifier: row.code_verifier } : {}),
        ...(row.state ? { state: row.state } : {}),
        ...(row.state_expires_at
          ? { stateExpiresAt: row.state_expires_at }
          : {}),
        ...(row.discovery_json
          ? { discovery: parseRecord(row.discovery_json) }
          : {}),
      };
    },

    findOAuthState(
      state: string,
    ): { connection: StoredMcpConnection; oauth: StoredMcpOAuth } | undefined {
      const row = db
        .prepare(
          `SELECT c.* FROM mcp_connections c
             JOIN mcp_oauth o ON o.connection_id = c.id
            WHERE o.state = ?`,
        )
        .get(state) as ConnectionRow | undefined;
      if (!row) return undefined;
      const connection = toStored(row);
      const oauth = this.getOAuth(connection.id);
      return oauth ? { connection, oauth } : undefined;
    },

    consumeOAuthState(
      state: string,
      now = Date.now(),
    ): { connection: StoredMcpConnection; oauth: StoredMcpOAuth } | undefined {
      const found = this.findOAuthState(state);
      if (!found || (found.oauth.stateExpiresAt ?? 0) <= now) return undefined;
      const changed = db
        .prepare(
          "UPDATE mcp_oauth SET state = NULL, state_expires_at = NULL, updated_at = ? WHERE connection_id = ? AND state = ?",
        )
        .run(now, found.connection.numericId, state).changes;
      return changed === 1 ? found : undefined;
    },

    clearOAuthAuthorization(connectionId: string): void {
      const numeric = numericId(connectionId);
      if (!numeric) return;
      db.prepare(
        `UPDATE mcp_oauth
            SET code_verifier = NULL, state = NULL, state_expires_at = NULL, updated_at = ?
          WHERE connection_id = ?`,
      ).run(Date.now(), numeric);
    },

    setLastError(connectionId: string, error: string | null): void {
      const numeric = numericId(connectionId);
      if (!numeric) return;
      db.prepare(
        "UPDATE mcp_connections SET last_error = ?, updated_at = ? WHERE id = ?",
      ).run(error, Date.now(), numeric);
    },

    setEnabled(connectionId: string, enabled: boolean): void {
      const numeric = numericId(connectionId);
      if (!numeric) return;
      db.prepare(
        "UPDATE mcp_connections SET enabled = ?, updated_at = ? WHERE id = ?",
      ).run(enabled ? 1 : 0, Date.now(), numeric);
    },
  };
}
