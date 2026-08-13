# Remix connected apps

**Status:** Approved design, pending implementation-plan review  
**Date:** 2026-08-13  
**Scope:** Freestyle desktop (`apps/electron`) and Freestyle Cloud (`cloud/apps/server`)

## Goal

Let a signed-in Freestyle user connect third-party apps from the desktop client
and use those apps as tools in Remix. Provider OAuth credentials remain with
Composio. Freestyle Cloud stores only opaque connection references and owns all
access decisions, so one user's connector data and MCP gateway can never be
used by another user.

## Non-goals

- Standalone desktop automations or connector-triggered workflows.
- Sharing connections between users, organizations, or desktop installations.
- Arbitrary custom MCP endpoints in v1.
- Multiple simultaneously active accounts for the same toolkit.
- Letting the renderer, the model, or the embedded desktop server handle
  provider access or refresh tokens.

## Chosen approach

Freestyle Cloud is the connector control plane and Remix tool host. It uses the
Composio server SDK with the Freestyle Cloud service credential. The desktop is
a signed-in management UI only.

For each Remix run, Cloud builds a short-lived Composio MCP session scoped to
the authenticated Cloud user and to that user's active connection records. Its
tools are exposed to the existing Remix server-tool factory. Tool definitions
are namespaced by toolkit and restricted to a persisted allow-list.

## Ownership and isolation

The authenticated Cloud identity (`c.get("user").id`) is the only owner key.
Every connector read and write filters by this value on the server. The desktop
does not send a user ID, a connection ID owned by another user, an MCP URL, or
credentials as authority.

The persisted connection record includes:

- `id`: server-generated opaque identifier.
- `user_id`: required FK to `users.id`, with a composite unique index on
  `(user_id, toolkit_slug)`.
- `toolkit_slug`, display metadata, and a selected-tool allow-list.
- Composio's opaque connected-account ID; never OAuth access or refresh tokens.
- `status`: `pending`, `active`, `needs_reconnect`, or `disconnected`.
- timestamps and non-secret status reason.

The callback state is a separate short-lived, single-use record bound to the
same user, toolkit, connection, and Cloud callback URL. It expires promptly and
contains no provider token. Composio remains the token store.

Composio MCP session identity is `freestyle-user:${user.id}`. Session creation
also passes only the account IDs loaded from that user's active connection
records. This is defense in depth: row-level ownership filters prevent mixed
accounts before the session is assembled, and the Composio session cannot
discover another user's accounts.

## Cloud API

All connector endpoints sit behind Cloud's existing authenticated middleware.

| Endpoint | Purpose |
| --- | --- |
| `GET /v2/connectors/catalog` | Searchable Composio toolkit catalog, with the caller's redacted status. |
| `GET /v2/connectors` | Caller-owned connection list only. |
| `POST /v2/connectors/:toolkit/connect` | Create/reuse a pending record, create a bound OAuth state, and return a browser URL. |
| `GET /v2/connectors/:toolkit/status` | Poll the caller's redacted state during OAuth. |
| `GET /v2/connectors/callback` | Verify state, reconcile Composio's connected account, and activate the caller's record. |
| `POST /v2/connectors/:toolkit/disconnect` | Mark disconnected, delete/revoke the Composio connected account when supported, and invalidate cached tools. |

Webhooks from Composio are verified with a configured secret. Credential-expiry
events locate the opaque account reference, transition its owner record to
`needs_reconnect`, and invalidate the connection/tool cache. Remix ignores
non-active records.

## Desktop experience

Add a **Connected apps** section to desktop Settings:

- Fetch the catalog from Cloud and show a searchable list split into Connected
  and Available.
- **Connect** calls Cloud and opens the returned OAuth URL with Electron's
  system-browser handoff. The renderer receives neither callback credentials
  nor state secrets.
- While an attempt is pending, poll only the toolkit's redacted status and
  update the card on success, expiry, or reconnect-needed state.
- A connected card shows connector name, account label when Composio supplies
  one, enabled tool count, health, Reconnect, and Disconnect.
- v1 permits one active account per toolkit per user. Connecting a new account
  replaces the existing account after successful authorization.

## Remix gateway and approval

The existing `remixServerTools` factory gains an authenticated connector tool
source. On each run it loads only the caller's active records, resolves a
short-lived Composio MCP session, and registers its filtered/namespaced tools.
The system prompt advertises connector tools only when they are present.

Tool metadata classifies calls as read-only or mutating. Read-only calls execute
on Cloud. A mutating call does not execute immediately: it returns a pending
approval representation to the Remix UI. The desktop displays the exact
connector, action, and validated arguments. Approval creates a short-lived,
single-use token bound to the Cloud user, conversation, connection, tool name,
and normalized arguments. Cloud executes the action only when all bindings
match; changing any bound value requires a fresh approval. Rejection or expiry
does not execute the action.

Provider error details, MCP URLs, OAuth state, and secrets are never passed to
the model or renderer. User-facing errors explain whether the connector needs
reconnection, is unavailable, or needs a fresh approval.

## Failure handling

- OAuth callback state expiry/consumption: show retryable Connect state.
- Denied OAuth: retain no active account; show connection was not completed.
- Expired/invalid account or verified webhook: mark `needs_reconnect`, omit
  tools from subsequent runs, and expose Reconnect in Settings.
- Composio outage/session failure: omit connector tools for the current turn;
  do not fail editing or web-search tools.
- Disconnect: immediately invalidate session/tool caches and remove the
  connection from later runs, even if upstream deletion is best-effort.

## Security requirements

- Cloud service credentials and webhook secrets are deployment secrets.
- Composio is the OAuth token custodian. D1 never stores OAuth tokens.
- All remote callback/webhook inputs are signature/state validated and replay
  protected.
- Tool arguments validate against the actual MCP tool schema before pending
  approval and again before execution.
- Logs and Sentry metadata redact OAuth state, Composio session headers,
  connected-account IDs where they could be sensitive, and tool arguments that
  may contain user data.

## Tests

- Route tests cover catalog/list/connect/status/disconnect ownership: user A
  cannot inspect or change user B's records, status, pending state, approvals,
  or tools.
- Unit tests cover callback state expiry, one-time use, callback ownership,
  active/reconnect/disconnected transitions, and cache invalidation.
- Gateway tests prove the MCP session receives only active account IDs for the
  authenticated user and only each connection's allow-listed tools.
- Remix tests cover read-only execution, pending write approval, approved
  execution, rejection, and approval expiry/argument mismatch.
- Renderer tests cover catalog, loading/error/pending/reconnect cards, the
  browser handoff, and disconnect refresh.
- Manual smoke test with two Cloud users connected to the same provider proves
  that each user's Remix tools return only their own provider data.

## Rollout

1. Deploy Cloud schema and APIs behind a `COMPOSIO_API_KEY` availability check.
2. Deploy desktop management UI; users without configured Cloud connectors see
   a clear unavailable state.
3. Enable connector tools for Remix after the approval UI and two-user isolation
   smoke test pass.
4. Add webhooks and operational alerts before broad enablement; expired accounts
   degrade to reconnect rather than runtime failures.
