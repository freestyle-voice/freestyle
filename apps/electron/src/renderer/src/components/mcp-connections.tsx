import type {
  McpConnectionInput,
  McpConnectionSummary,
} from "@freestyle-voice/validations";
import { Button } from "@renderer/components/ui/button";
import { Input } from "@renderer/components/ui/input";
import {
  createMcpConnection,
  listMcpConnections,
  removeMcpConnection,
  setMcpConnectionEnabled,
  startMcpOAuth,
  testMcpConnection,
} from "@renderer/lib/mcp";
import { queryKeys } from "@renderer/lib/query";
import { cn } from "@renderer/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, PlugZap, Plus, Trash2 } from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useState } from "react";

type Transport = "http" | "stdio";
type AuthType = "none" | "bearer" | "headers" | "oauth";

type ConnectionForm = {
  name: string;
  transport: Transport;
  url: string;
  command: string;
  args: string;
  cwd: string;
  env: string;
  authType: AuthType;
  bearerToken: string;
  headers: string;
};

const EMPTY_FORM: ConnectionForm = {
  name: "",
  transport: "http",
  url: "",
  command: "",
  args: "",
  cwd: "",
  env: "",
  authType: "none",
  bearerToken: "",
  headers: "",
};

function parseKeyValues(
  value: string,
  separator: "=" | ":",
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const rawLine of value.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    const index = line.indexOf(separator);
    const key = line.slice(0, index).trim();
    const entry = line.slice(index + 1).trim();
    if (index <= 0 || !key || !entry) {
      throw new Error(
        `Use one ${separator === "=" ? "KEY=value" : "Header: value"} entry per line.`,
      );
    }
    result[key] = entry;
  }
  return result;
}

/** One argument per line preserves paths and values that contain spaces. */
function parseMcpArgs(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function errorCopy(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "This MCP connection could not be completed.";
}

function statusCopy(connection: McpConnectionSummary): string {
  if (connection.authStatus === "pending")
    return "Finish connecting in your browser";
  if (connection.authStatus === "not_connected")
    return "Connect this account before testing";
  if (connection.authStatus === "failed")
    return connection.lastError ?? "Connection needs attention";
  if (connection.enabled)
    return `${connection.toolCount} ${connection.toolCount === 1 ? "tool" : "tools"} available to Remix`;
  return connection.toolCount > 0
    ? `${connection.toolCount} ${connection.toolCount === 1 ? "tool" : "tools"} found — enable when ready`
    : "Test the connection to discover its tools";
}

function ConnectionCard({
  connection,
  actionId,
  onTest,
  onToggle,
  onConnect,
  onRemove,
}: {
  connection: McpConnectionSummary;
  actionId: string | null;
  onTest: () => void;
  onToggle: (enabled: boolean) => void;
  onConnect: () => void;
  onRemove: () => void;
}): React.JSX.Element {
  const busy = actionId === connection.id;
  const oauthNeedsConnection =
    connection.authType === "oauth" && connection.authStatus !== "connected";
  return (
    <article className="border-border bg-card/35 rounded-xl border px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <PlugZap
              className="text-primary size-4 shrink-0"
              aria-hidden="true"
            />
            <h3 className="text-foreground truncate text-[15px] font-medium">
              {connection.name}
            </h3>
          </div>
          <p className="text-muted-foreground mt-1 text-xs leading-5">
            {connection.transport === "stdio" ? "Local stdio" : "Remote HTTP"} ·{" "}
            {connection.authType === "oauth"
              ? "OAuth"
              : connection.authType === "bearer"
                ? "Bearer token"
                : connection.authType === "headers"
                  ? "Custom headers"
                  : "No authentication"}
          </p>
        </div>
        <span
          className={cn(
            "rounded-full px-2 py-1 text-[10px] font-semibold tracking-[0.12em] uppercase",
            connection.enabled
              ? "bg-primary/15 text-primary"
              : "bg-muted text-muted-foreground",
          )}
        >
          {connection.enabled ? "Enabled" : "Disabled"}
        </span>
      </div>

      <p className="text-muted-foreground mt-3 text-xs leading-5">
        {statusCopy(connection)}
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {oauthNeedsConnection ? (
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={onConnect}
          >
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
            Connect account
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled={busy} onClick={onTest}>
            {busy ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Check className="size-3.5" />
            )}
            Test connection
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          disabled={
            busy ||
            oauthNeedsConnection ||
            (!connection.enabled && connection.toolCount === 0)
          }
          onClick={() => onToggle(!connection.enabled)}
        >
          {connection.enabled ? "Disable" : "Enable"}
        </Button>
        <Button
          className="text-muted-foreground hover:text-destructive"
          variant="ghost"
          size="icon"
          disabled={busy}
          aria-label={`Remove ${connection.name}`}
          onClick={onRemove}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    </article>
  );
}

function McpConnectionsSkeleton(): React.JSX.Element {
  return (
    <div
      className="grid gap-3"
      role="status"
      aria-label="Loading MCP connections"
    >
      {["first", "second"].map((key) => (
        <article
          key={key}
          className="border-border bg-card/35 animate-pulse rounded-xl border px-4 py-4 sm:px-5"
          aria-hidden="true"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <span className="bg-muted size-4 shrink-0 rounded" />
              <span className="bg-muted h-4 w-36 rounded" />
            </div>
            <span className="bg-muted h-5 w-14 rounded-full" />
          </div>
          <span className="bg-muted mt-3 block h-3 w-32 rounded" />
          <span className="bg-muted mt-4 block h-8 w-28 rounded-md" />
        </article>
      ))}
    </div>
  );
}

export function McpConnections(): React.JSX.Element {
  const queryClient = useQueryClient();
  const connections = useQuery({
    queryKey: queryKeys.mcp.connections,
    queryFn: listMcpConnections,
  });
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<ConnectionForm>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);

  const refresh = useCallback(
    () => queryClient.invalidateQueries({ queryKey: queryKeys.mcp.all }),
    [queryClient],
  );
  useEffect(() => {
    const onWindowFocus = () => void refresh();
    window.addEventListener("focus", onWindowFocus);
    return () => window.removeEventListener("focus", onWindowFocus);
  }, [refresh]);

  const create = useMutation({
    mutationFn: async () => {
      const local = form.transport === "stdio";
      const input: McpConnectionInput = local
        ? {
            name: form.name.trim(),
            transport: "stdio",
            command: form.command.trim(),
            args: parseMcpArgs(form.args),
            ...(form.cwd.trim() ? { cwd: form.cwd.trim() } : {}),
            ...(form.env.trim() ? { env: parseKeyValues(form.env, "=") } : {}),
          }
        : {
            name: form.name.trim(),
            transport: "http",
            url: form.url.trim(),
            authType: form.authType,
            ...(form.authType === "bearer"
              ? { bearerToken: form.bearerToken.trim() }
              : {}),
            ...(form.authType === "headers"
              ? { headers: parseKeyValues(form.headers, ":") }
              : {}),
          };
      return createMcpConnection(input);
    },
    onSuccess: () => {
      setForm(EMPTY_FORM);
      setShowForm(false);
      setError(null);
      void refresh();
    },
    onError: (createError) => setError(errorCopy(createError)),
  });

  const withConnectionAction = async (
    connection: McpConnectionSummary,
    action: () => Promise<void>,
  ) => {
    setActionId(connection.id);
    setError(null);
    try {
      await action();
      await refresh();
    } catch (actionError) {
      setError(errorCopy(actionError));
      await refresh();
    } finally {
      setActionId(null);
    }
  };

  return (
    <section className="flex flex-col gap-5 pb-24">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-foreground text-[17px] font-medium">
            MCP connections
          </h2>
          <p className="text-muted-foreground mt-1 max-w-xl text-[13px] leading-5">
            Let Remix use tools from local servers or trusted remote MCP
            endpoints. Commands, API keys, and OAuth tokens remain on this
            device.
          </p>
        </div>
        <Button size="sm" onClick={() => setShowForm((visible) => !visible)}>
          <Plus className="size-3.5" />
          Add connection
        </Button>
      </div>

      {showForm ? (
        <form
          className="border-border bg-card/35 rounded-xl border p-4 sm:p-5"
          onSubmit={(event) => {
            event.preventDefault();
            setError(null);
            create.mutate();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <label
              className="flex flex-col gap-1.5 text-sm font-medium"
              htmlFor="mcp-connection-name"
            >
              Connection name
              <Input
                value={form.name}
                id="mcp-connection-name"
                onChange={(event) =>
                  setForm({ ...form, name: event.target.value })
                }
                placeholder="Company tools"
                required
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Connection type
              <select
                className="border-input bg-background h-9 rounded-md border px-3 text-sm"
                value={form.transport}
                onChange={(event) =>
                  setForm({
                    ...form,
                    transport: event.target.value as Transport,
                  })
                }
              >
                <option value="http">Remote HTTP</option>
                <option value="stdio">Local stdio</option>
              </select>
            </label>
          </div>

          {form.transport === "http" ? (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label
                className="flex flex-col gap-1.5 text-sm font-medium sm:col-span-2"
                htmlFor="mcp-connection-url"
              >
                MCP endpoint
                <Input
                  type="url"
                  id="mcp-connection-url"
                  value={form.url}
                  onChange={(event) =>
                    setForm({ ...form, url: event.target.value })
                  }
                  placeholder="https://mcp.example.com/mcp"
                  required
                />
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                Authentication
                <select
                  className="border-input bg-background h-9 rounded-md border px-3 text-sm"
                  value={form.authType}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      authType: event.target.value as AuthType,
                    })
                  }
                >
                  <option value="none">None</option>
                  <option value="oauth">OAuth</option>
                  <option value="bearer">Bearer token</option>
                  <option value="headers">Custom headers</option>
                </select>
              </label>
              {form.authType === "bearer" ? (
                <label
                  className="flex flex-col gap-1.5 text-sm font-medium"
                  htmlFor="mcp-bearer-token"
                >
                  Bearer token
                  <Input
                    type="password"
                    id="mcp-bearer-token"
                    autoComplete="off"
                    value={form.bearerToken}
                    onChange={(event) =>
                      setForm({ ...form, bearerToken: event.target.value })
                    }
                    required
                  />
                </label>
              ) : null}
              {form.authType === "headers" ? (
                <label className="flex flex-col gap-1.5 text-sm font-medium sm:col-span-2">
                  Custom headers
                  <textarea
                    className="border-input bg-background min-h-20 rounded-md border p-2 text-sm"
                    value={form.headers}
                    onChange={(event) =>
                      setForm({ ...form, headers: event.target.value })
                    }
                    placeholder={"X-API-Key: your-secret"}
                    required
                  />
                </label>
              ) : null}
            </div>
          ) : (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label
                className="flex flex-col gap-1.5 text-sm font-medium"
                htmlFor="mcp-connection-command"
              >
                Command
                <Input
                  value={form.command}
                  id="mcp-connection-command"
                  onChange={(event) =>
                    setForm({ ...form, command: event.target.value })
                  }
                  placeholder="npx"
                  required
                />
              </label>
              <label
                className="flex flex-col gap-1.5 text-sm font-medium"
                htmlFor="mcp-connection-args"
              >
                Arguments (one per line)
                <textarea
                  className="border-input bg-background min-h-20 rounded-md border p-2 text-sm"
                  value={form.args}
                  id="mcp-connection-args"
                  onChange={(event) =>
                    setForm({ ...form, args: event.target.value })
                  }
                  placeholder={
                    "-y\n@modelcontextprotocol/server-filesystem\n/Users/you/project"
                  }
                />
              </label>
              <label
                className="flex flex-col gap-1.5 text-sm font-medium"
                htmlFor="mcp-connection-cwd"
              >
                Working directory (optional)
                <Input
                  value={form.cwd}
                  id="mcp-connection-cwd"
                  onChange={(event) =>
                    setForm({ ...form, cwd: event.target.value })
                  }
                  placeholder="/Users/you/project"
                />
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                Environment (optional)
                <textarea
                  className="border-input bg-background min-h-20 rounded-md border p-2 text-sm"
                  value={form.env}
                  onChange={(event) =>
                    setForm({ ...form, env: event.target.value })
                  }
                  placeholder={"API_KEY=your-secret"}
                />
              </label>
            </div>
          )}
          {error ? (
            <p className="text-destructive mt-3 text-xs">{error}</p>
          ) : null}
          <div className="mt-5 flex justify-end gap-2">
            <Button
              variant="ghost"
              type="button"
              onClick={() => {
                setShowForm(false);
                setError(null);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : null}
              Save connection
            </Button>
          </div>
        </form>
      ) : null}

      {connections.isLoading ? <McpConnectionsSkeleton /> : null}
      {connections.isError ? (
        <p className="text-destructive text-sm">
          Could not load MCP connections. Try again.
        </p>
      ) : null}
      <div className="grid gap-3">
        {(connections.data ?? []).map((connection) => (
          <ConnectionCard
            key={connection.id}
            connection={connection}
            actionId={actionId}
            onTest={() =>
              void withConnectionAction(connection, async () => {
                await testMcpConnection(connection.id);
              })
            }
            onToggle={(enabled) =>
              void withConnectionAction(connection, async () => {
                await setMcpConnectionEnabled(connection.id, enabled);
              })
            }
            onConnect={() =>
              void withConnectionAction(connection, async () => {
                const opened = await window.api.openExternal(
                  await startMcpOAuth(connection.id),
                );
                if (!opened) {
                  throw new Error(
                    "Could not open your browser to connect this MCP server.",
                  );
                }
              })
            }
            onRemove={() =>
              void withConnectionAction(connection, async () => {
                await removeMcpConnection(connection.id);
              })
            }
          />
        ))}
      </div>
      {!connections.isLoading && (connections.data?.length ?? 0) === 0 ? (
        <div className="border-border rounded-xl border border-dashed px-5 py-7 text-center">
          <p className="text-foreground text-sm font-medium">
            No MCP connections yet
          </p>
          <p className="text-muted-foreground mt-1 text-xs">
            Add a local server or a trusted remote endpoint to give Remix more
            tools.
          </p>
        </div>
      ) : null}
    </section>
  );
}
