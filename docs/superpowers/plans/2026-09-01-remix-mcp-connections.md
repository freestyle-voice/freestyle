# Remix MCP Connections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Remix secure, desktop-owned local and remote MCP tools with bearer/header/OAuth authentication.

**Architecture:** Desktop owns connection configuration, credentials, OAuth state, SDK clients, and tool execution. Each Remix request carries only redacted MCP tool schemas to Cloud; Cloud declares those tools without an executor and the existing renderer tool-result continuation calls desktop to execute them. The settings page is a local connection manager under Remix.

**Tech Stack:** Electron, Hono, node:sqlite, React Query, Vercel AI SDK UI streams, MCP TypeScript SDK, Zod, OAuth 2.1 authorization code with PKCE.

**Spec:** `docs/superpowers/specs/2026-09-01-remix-mcp-connections.md`

## Global Constraints

- Credentials, OAuth tokens, command environments, and PKCE values are desktop-server-only and never sent to Cloud, renderer list APIs, analytics, or logs.
- Support stdio plus Streamable HTTP; permit HTTP only for loopback development endpoints.
- Keep the existing Remix model route unchanged.
- Use the existing renderer `addToolResult` continuation for MCP calls.
- Make every schema change mirrored in the Cloud validation package when it affects `/api/remix`.
- Do not restore a plugin pill bridge or plugin-agent runtime.

---

### Task 1: Define the redacted connection and Remix tool contracts

**Files:**
- Create: `packages/validations/src/mcp.ts`
- Create: `packages/validations/src/mcp.test.ts`
- Modify: `packages/validations/src/index.ts`
- Modify: `packages/validations/src/remix.ts`
- Modify: `/Users/am/dev/freestyle-voice/cloud/packages/validations/src/remix.ts`
- Test: `/Users/am/dev/freestyle-voice/cloud/packages/validations/src/remix.test.ts`

**Interfaces:**
- Produces `mcpConnectionInputSchema`, `mcpConnectionSummarySchema`, `mcpToolWireSchema`, `mcpCallSchema`, and `remixMcpToolSchema`.
- Extends `remixAgentRequestSchema` with optional `mcpTools: RemixMcpTool[]`.

- [ ] **Step 1: Write failing desktop validation tests** for a valid stdio connection, a valid HTTPS OAuth connection, rejected credential-bearing URL, output redaction, unique safe tool wire names, and bounded JSON schema.
- [ ] **Step 2: Run the focused validation test** and confirm it fails because MCP contracts do not exist.
- [ ] **Step 3: Implement the smallest Zod contracts** with `transport`, `authType`, write-only secrets, safe redacted summaries, safe wire names, capped tool schemas, and optional `mcpTools` in the Remix request.
- [ ] **Step 4: Mirror only the Remix wire contract into Cloud** and add Cloud contract tests for tool bounds/collisions/secret rejection.
- [ ] **Step 5: Run desktop and Cloud focused validation tests** and confirm they pass.

### Task 2: Add local MCP persistence and redaction

**Files:**
- Create: `apps/server/src/lib/mcp/store.ts`
- Create: `apps/server/src/lib/mcp/store.test.ts`
- Modify: `apps/server/src/lib/schema.ts`
- Test: `apps/server/tests/mcp-migration.test.ts`

**Interfaces:**
- Consumes Task 1 schemas.
- Produces `McpConnectionStore` methods: `list`, `getPrivate`, `create`, `update`, `remove`, `saveTools`, `getTools`, and OAuth state accessors.

- [ ] **Step 1: Write failing migration/store tests** that assert forward migration creates the three tables, list responses redact secrets, updates preserve an existing secret when omitted, and deletion cascades OAuth/cache rows.
- [ ] **Step 2: Run focused tests** and confirm the missing store/schema failure.
- [ ] **Step 3: Add schema version 29 and a focused store** using parameterized SQL, JSON parsing guards, and redacted summary mapping.
- [ ] **Step 4: Run focused migration/store tests** and confirm green.

### Task 3: Add a testable MCP client and OAuth provider

**Files:**
- Modify: `apps/server/package.json`
- Modify: `pnpm-lock.yaml`
- Create: `apps/server/src/lib/mcp/client.ts`
- Create: `apps/server/src/lib/mcp/client.test.ts`
- Create: `apps/server/src/lib/mcp/oauth.ts`
- Create: `apps/server/src/lib/mcp/oauth.test.ts`

**Interfaces:**
- Consumes `McpConnectionStore`.
- Produces `discoverConnectionTools(connection)`, `callConnectionTool(connection, wireName, input)`, `startOAuth(connection)`, and `completeOAuth(state, code)`.

- [ ] **Step 1: Add failing tests** for stdio and HTTP transport selection, list/call timeout/output cap, blocked disabled/unknown wire tools, OAuth state mismatch/reuse, and redacted errors.
- [ ] **Step 2: Run focused tests** and confirm failures before implementation.
- [ ] **Step 3: Add `@modelcontextprotocol/sdk` directly to the desktop server package** and implement short-lived clients: stdio uses a safe inherited environment plus user values; HTTP uses Streamable HTTP with static auth or an `OAuthClientProvider`.
- [ ] **Step 4: Implement the persisted OAuth provider** with PKCE/state/client metadata/tokens/discovery state, a loopback redirect URL, and a one-time callback completion path. Do not turn off SDK issuer/resource validation.
- [ ] **Step 5: Run focused client/OAuth tests** and confirm green.

### Task 4: Expose local MCP routes and inject tools into Remix

**Files:**
- Create: `apps/server/src/routes/mcp.ts`
- Create: `apps/server/tests/mcp-routes.test.ts`
- Modify: `apps/server/src/routes/index.ts`
- Modify: `apps/server/src/routes/remix.ts`
- Modify: `apps/server/tests/remix-agent-proxy.test.ts`

**Interfaces:**
- Consumes Task 1 contracts and Task 3 client methods.
- Produces `/api/mcp/*` and adds `mcpTools` to the desktop-to-Cloud Remix request.

- [ ] **Step 1: Write failing route tests** for list/create/update/delete redaction, explicit test operation, callback invalid-state rejection, OAuth status, blocked call, and a proxy body that contains tool descriptions but no secret keys.
- [ ] **Step 2: Run focused route/proxy tests** and confirm failures.
- [ ] **Step 3: Implement routes** with trusted-origin protection, a narrow no-Origin OAuth callback that requires a valid single-use state, safe messages, and request abort/timeout propagation.
- [ ] **Step 4: Implement `/api/remix` MCP tool injection** from enabled cached/live tools without changing model/provider behavior.
- [ ] **Step 5: Run focused route/proxy tests** and confirm green.

### Task 5: Let Cloud declare MCP tools and let Remix execute them locally

**Files:**
- Modify: `/Users/am/dev/freestyle-voice/cloud/apps/server/src/routes/v2/remix/index.ts`
- Create: `/Users/am/dev/freestyle-voice/cloud/apps/server/src/__tests__/remix-mcp-tools.test.ts`
- Modify: `apps/electron/src/renderer/src/components/remix-chat.tsx`
- Create: `apps/electron/src/renderer/src/components/remix-chat-mcp.test.tsx`

**Interfaces:**
- Consumes `mcpTools` from Task 1.
- Cloud produces non-executing dynamic client tools from `mcpTools`.
- Renderer sends `{ toolName, toolCallId, input }` to `/api/mcp/calls` and passes its output to `addToolResult`.

- [ ] **Step 1: Write failing Cloud tests** for dynamic MCP tool declaration, collision rejection, and no execute handler.
- [ ] **Step 2: Write a failing renderer test** showing a streamed MCP tool call reaches local `/api/mcp/calls` and triggers the existing continuation result.
- [ ] **Step 3: Implement Cloud registration and renderer dispatch** while retaining the current built-in tool switch unchanged.
- [ ] **Step 4: Run focused Cloud and renderer tests** and confirm green.

### Task 6: Build the Remix MCP settings experience

**Files:**
- Create: `apps/electron/src/renderer/src/lib/mcp-api.ts`
- Create: `apps/electron/src/renderer/src/components/mcp-connections.tsx`
- Create: `apps/electron/src/renderer/src/components/mcp-connections.test.tsx`
- Modify: `apps/electron/src/renderer/src/lib/query.ts`
- Modify: `apps/electron/src/renderer/src/shell.tsx`
- Modify: `apps/electron/src/renderer/src/pages/settings.tsx`
- Modify: `apps/electron/src/renderer/src/pages/settings.test.tsx`

**Interfaces:**
- Produces `/settings/mcp` with a connection list, add/edit form, test/enable/delete actions, and OAuth browser connection state.

- [ ] **Step 1: Write failing UI tests** for navigation, redacted summaries, transport-specific fields, explicit OAuth connect, disabled test state, and optimistic refresh after mutation.
- [ ] **Step 2: Run focused renderer tests** and confirm failures.
- [ ] **Step 3: Implement query keys/API client and the compact settings manager** using the existing settings row/panel design language.
- [ ] **Step 4: Make OAuth open only the URL returned by the local server** and poll/query the redacted OAuth state after the app regains focus.
- [ ] **Step 5: Run focused renderer tests** and confirm green.

### Task 7: Document and verify the end-to-end contract

**Files:**
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `apps/docs/docs.json`
- Create: `apps/docs/features/mcp.mdx`
- Modify: `apps/docs/features/remix.mdx`

- [ ] **Step 1: Document supported transports, authentication, local-only secret storage, OAuth redirect behavior, and limits without implying Cloud receives credentials.**
- [ ] **Step 2: Run focused tests, workspace test, desktop/server typecheck, Cloud test/typecheck, Electron build, docs validation, formatting, and `git diff --check`.**
- [ ] **Step 3: Run the focused Electron end-to-end suite outside the sandbox if required by Electron.**
- [ ] **Step 4: Review every modified API boundary for secret leakage, route auth, schema parity, and continuation regressions.**
