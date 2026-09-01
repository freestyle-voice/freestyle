# Remix MCP Connections Design

## Goal

Let a signed-in Remix user connect local and remote Model Context Protocol
(MCP) servers from Remix settings. Remix may call the enabled server tools in a
conversation without sending connection credentials, OAuth tokens, or local
process configuration to Freestyle Cloud.

## Scope

The first release supports the two MCP transports that fit the desktop trust
boundary:

- **Local (stdio):** command, arguments, optional working directory, and a
  user-supplied environment map. The desktop server spawns it only when it
  probes tools or serves a Remix tool call.
- **Remote (Streamable HTTP):** an HTTPS endpoint with no authentication,
  bearer token, static headers, or MCP OAuth.
- **Remote OAuth:** authorization-code flow with PKCE, resource metadata and
  authorization-server metadata discovery, and dynamic client registration
  when the remote server supports it.

The desktop server owns every MCP connection. The renderer sees redacted
connection summaries and tool metadata only. Cloud receives only the enabled
tool schemas needed for a single Remix turn.

## Non-goals

- No plugin `contributes.pill` API, alternate agent runtime, or separate MCP
  plugin host.
- No MCP resources, prompts, sampling, elicitation, filesystem, shell, or
  background scheduled calls in this release.
- No Cloud-side credential, OAuth-token, or remote-MCP session storage.
- No change to Remix model selection or local-model routing.

## Data model and secrecy

The desktop SQLite database gets three device-local tables:

- `mcp_connections`: public configuration plus opaque device-local secret JSON.
  Columns contain `id`, `name`, `transport`,
  `endpoint`, `command`, `args_json`, `cwd`, `enabled`, `auth_type`,
  `secret_json`, timestamps, and `last_error`. Read APIs never return
  `secret_json`, command environment values, OAuth tokens, client secrets, or
  PKCE verifiers.
- `mcp_oauth`: one row per remote OAuth connection. It stores tokens, dynamic
  client registration, PKCE verifier, expected `state`, and discovered OAuth
  metadata. It is server-only and deleted with its connection.
- `mcp_tools`: the last successful, sanitized `tools/list` response per
  connection. It is an availability cache; execution always revalidates the
  requested tool against the current live server response.

The current desktop key store persists model API keys in local SQLite. MCP
secrets use the same device-local server boundary for this release, are never
returned by an API, and are excluded from analytics/logs. A later OS-keychain
migration can change only the secret-store adapter, not the connection or
Cloud contracts.

## Desktop API

All endpoints live under `/api/mcp` and are protected by the existing trusted
renderer-origin middleware, except the loopback OAuth callback, which accepts
only a valid single-use `state` and never returns a token.

- `GET /connections` returns redacted connection summaries and cached tool
  counts.
- `POST /connections` validates and stores a connection without secrets in its
  response.
- The first settings surface manages connections through create, test,
  enable/disable, and remove. Editing is intentionally deferred until secrets
  can be replaced without making users re-enter unrelated values.
- `DELETE /connections/:id` deletes connection, OAuth state, cached tools, and
  any in-memory client.
- `POST /connections/:id/test` connects, lists tools, refreshes the cache, and
  returns only a success summary or safe error.
- `POST /connections/:id/oauth/start` begins the SDK OAuth authorization-code
  flow and returns an authorization URL. The renderer opens it in the system
  browser.
- `GET /oauth/callback` verifies state, exchanges the code using stored PKCE
  state, refreshes tools, and renders a short completion page.
- `GET /connections/:id/oauth` reports `not_required`, `not_connected`,
  `pending`, `connected`, or `failed` with no token material.
- `POST /calls` accepts a desktop-generated MCP wire-tool name and JSON input,
  re-checks enabled/live ownership, calls the corresponding MCP tool, then
  returns capped structured content to the renderer.

## Remix turn contract

1. Before proxying `/api/remix`, desktop resolves enabled MCP tools from its
   local cache/live registry and appends `mcpTools` to the request. Each schema
   has a deterministic desktop wire name (`mcp_<connectionId>_<tool>`), a
   description, and a JSON Schema input shape. No URL, header, token, command,
   or server identity is sent to Cloud beyond the tool description/name.
2. Cloud validates bounds, rejects collisions with its native and desktop
   client tools, and exposes these as non-executing AI SDK client tools.
3. When the model selects an MCP tool, it is streamed to the existing Remix
   renderer tool-call path.
4. The renderer recognizes the namespaced MCP wire name, POSTs it and the
   model input to desktop `/api/mcp/calls`, and adds the resulting tool output
   with the existing `addToolResult` continuation mechanism.
5. The following stream request includes the tool result and the same enabled
   tool definitions, allowing the Cloud agent to continue normally.

MCP tool output is bounded before it reaches the model: text content is capped,
binary/resource blocks are summarized, and tool errors are returned as
structured `{ ok: false, reason }` output rather than unhandled renderer
errors.

## OAuth behavior

Remote OAuth uses the MCP TypeScript SDK's `OAuthClientProvider` and
`StreamableHTTPClientTransport`. The desktop provider persists:

- PKCE verifier and a cryptographically-random one-time state;
- discovered protected-resource and authorization-server metadata;
- dynamic client registration; and
- access/refresh tokens.

The browser redirect URI is the loopback server callback. The callback rejects
missing, expired, reused, or mismatched state before exchanging a code. The
connection remains disabled for tool execution until OAuth completes and a
successful tool discovery occurs. A later 401 clears invalid credentials and
returns a reauthorization-needed result; it does not silently retry a
potentially side-effecting tool call.

## Settings UX

Add `MCP connections` beneath Remix settings. It has a concise list of
connections with enabled state, auth status, tool count, and last safe error.
The add flow starts with transport, then shows only its relevant fields:

- stdio: name, command, arguments, working directory, environment variables;
- HTTP: name, HTTPS URL, authentication mode; and
- OAuth: Connect in browser after the remote endpoint is saved.

Testing and enabling are explicit actions. Saving an OAuth connection does not
open a browser unexpectedly. Delete confirms the local credential removal.

## Safety and limits

- Remote URLs must be HTTPS, except loopback HTTP for local development.
- Stdio command and args are never returned to the renderer after save; only a
  redacted summary is shown. Environment values are write-only.
- Connection ids, tool names, schema size, call input size, output size,
  discovery time, and tool-call time are bounded.
- The desktop server logs connection ids and safe error categories only. It
  never logs auth headers, URLs with credentials, environment values, OAuth
  code/state/token values, or MCP tool arguments/results.
- A disabled, deleted, unknown, or ambiguous wire name cannot be executed.

## Verification

- Unit-test schemas, redaction, tool wire-name parsing, state validation, and
  output caps.
- Route-test CRUD redaction, test/discovery, OAuth callback state failures, and
  disabled/unknown tool execution.
- Desktop proxy-test that `mcpTools` are forwarded without secret fields.
- Renderer-test dynamic MCP call dispatch and a continued chat turn.
- Cloud route-test that valid MCP tools are declared without execute handlers,
  collisions are rejected, and secrets are rejected by the shared schema.
- Run desktop/server tests, Cloud tests/typecheck, Electron typecheck/build,
  formatting, and the focused Electron end-to-end suite.
