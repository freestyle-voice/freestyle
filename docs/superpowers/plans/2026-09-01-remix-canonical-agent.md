# Canonical Remix Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/v2/remix` the canonical desktop and mobile conversational-agent endpoint while retaining `/v2/agent` for old clients.

**Architecture:** Cloud owns all canonical tool descriptors and executes only Cloud-safe tools. Desktop advertises an allowlisted local tool-name set through its trusted local proxy; Remix declares the matching tools without `execute`, and the renderer approval/executor loop runs them locally. Mobile migrates to the same Remix route with a deliberately empty desktop-local surface.

**Tech Stack:** TypeScript, Hono, Zod, Vercel AI SDK, React, React Native, Vitest, Electron IPC.

**Spec:** `specs/remix-canonical-agent.md`

## Global Constraints

- `/v2/agent` remains behaviorally compatible for existing clients.
- Cloud never receives local tool implementations, shell commands for execution, or filesystem credentials.
- `client` capability fields are optional; absent local-tool capabilities expose no desktop-local tools.
- Mobile platforms never receive local desktop tools, even if they send malformed capabilities.
- Desktop-local tools retain their existing explicit approval gate; only `current_time` and `emote` stay free.
- Shared Remix validation definitions must remain mirrored in both repositories.

---

### Task 1: Define canonical Remix client capabilities and local-tool registry

**Files:**
- Modify: `packages/validations/src/remix.ts`
- Modify: `/Users/am/dev/freestyle-voice/cloud/packages/validations/src/remix.ts`
- Modify: `/Users/am/dev/freestyle-voice/cloud/packages/validations/src/agent.ts`
- Test: `/Users/am/dev/freestyle-voice/cloud/apps/server/src/__tests__/remix-client-contract.test.ts`

**Interfaces:**
- Produces `remixClientCapabilitiesSchema`, `RemixClientCapabilities`, `REMIX_LOCAL_TOOLS`, `RemixLocalToolName`, `getRemixLocalTools(client)`.
- Consumes legacy `AGENT_CLIENT_TOOLS` descriptors without changing their names or input schemas.

- [ ] **Step 1: Write failing contract tests**

```ts
it("accepts a legacy Remix request without client capabilities", () => {
  expect(remixAgentRequestSchema.safeParse({ messages: [{}], context }).success).toBe(true);
});

it("exposes only advertised desktop tools and excludes them on mobile", () => {
  expect(Object.keys(getRemixLocalTools({ platform: "darwin", localTools: ["Bash"] }))).toEqual(["Bash"]);
  expect(getRemixLocalTools({ platform: "ios", localTools: ["Bash"] })).toEqual({});
});
```

- [ ] **Step 2: Run the contract test and verify it fails because the Remix capability exports do not exist**

Run: `pnpm --dir /Users/am/dev/freestyle-voice/cloud test -- apps/server/src/__tests__/remix-client-contract.test.ts`

Expected: FAIL with missing `getRemixLocalTools` or absent `client` parsing.

- [ ] **Step 3: Add the mirrored optional Remix capability schema and descriptor selector**

```ts
export const remixClientCapabilitiesSchema = z.object({
  platform: z.enum(["darwin", "win32", "linux", "ios", "android"]).optional(),
  localTools: z.array(z.enum(REMIX_LOCAL_TOOL_NAMES)).max(REMIX_LOCAL_TOOL_NAMES.length).optional(),
  supportsDownloadsSave: z.boolean().optional(),
  supportsKeyboardInsertion: z.boolean().optional(),
  supportsConnectorApprovals: z.boolean().optional(),
});

export function getRemixLocalTools(client?: RemixClientCapabilities) {
  if (isMobileRemixClient(client)) return {};
  return Object.fromEntries((client?.localTools ?? []).flatMap((name) => {
    const definition = REMIX_LOCAL_TOOLS[name];
    return definition ? [[name, definition]] : [];
  }));
}
```

`REMIX_LOCAL_TOOLS` must reuse the current `AGENT_CLIENT_TOOLS` definitions or a shared extracted module; do not duplicate descriptions or schemas.

- [ ] **Step 4: Run contract tests and mirrored validation typechecks**

Run: `pnpm --dir /Users/am/dev/freestyle-voice/cloud test -- apps/server/src/__tests__/remix-client-contract.test.ts && pnpm --filter @freestyle-voice/validations exec tsc --noEmit`

Expected: PASS.

- [ ] **Step 5: Commit the validation contract**

```bash
git add packages/validations/src/remix.ts
git commit -m "feat: declare Remix local tool capabilities"
```

### Task 2: Compose canonical Cloud Remix tools and prompt

**Files:**
- Modify: `/Users/am/dev/freestyle-voice/cloud/apps/server/src/routes/v2/remix/index.ts`
- Modify: `/Users/am/dev/freestyle-voice/cloud/apps/server/src/routes/v2/remix/prompt.ts`
- Modify: `/Users/am/dev/freestyle-voice/cloud/apps/server/src/routes/v2/remix/mcp-tools.ts`
- Test: `/Users/am/dev/freestyle-voice/cloud/apps/server/src/__tests__/remix-prompt.test.ts`
- Test: `/Users/am/dev/freestyle-voice/cloud/apps/server/src/__tests__/remix-route-tools.test.ts`

**Interfaces:**
- Consumes `getRemixLocalTools(client)` and optional `threadId`/`firstTurn` from Task 1.
- Produces a Remix `ToolSet` containing Cloud tools, cursor tools, advertised local tools, and MCP tools.

- [ ] **Step 1: Write failing tests for the canonical composition**

```ts
it("registers an advertised Bash declaration without an execute handler", async () => {
  const tools = await remixToolsFor({ client: { platform: "darwin", localTools: ["Bash"] } });
  expect(tools).toHaveProperty("Bash");
});

it("does not tell a mobile Remix client it can access a computer", () => {
  expect(buildRemixAgentSystem(context, caps, { platform: "ios" })).toContain("cannot access a computer");
});
```

- [ ] **Step 2: Run the route and prompt tests to verify they fail**

Run: `pnpm --dir /Users/am/dev/freestyle-voice/cloud test -- apps/server/src/__tests__/remix-prompt.test.ts apps/server/src/__tests__/remix-route-tools.test.ts`

Expected: FAIL because Remix does not register local descriptors or receive client platform context.

- [ ] **Step 3: Build the canonical Remix tool composition**

```ts
const localTools = Object.fromEntries(
  Object.entries(getRemixLocalTools(client)).map(([name, definition]) => [
    name,
    tool({ description: definition.description, inputSchema: definition.inputSchema as FlexibleSchema<Record<string, unknown>> }),
  ]),
);

tools: { ...serverTools, ...connectorTools.tools, ...brainTools, ...taskTools, ...notificationTools, ...cursorTools, ...localTools, ...desktopMcpTools }
```

Carry the existing agent route’s usage gate, persistence, attachments, compaction, timeout, scheduled tools, notification tools, and mobile connector approval behavior into shared Remix helpers. Keep `/v2/agent` calling those helpers or preserving its existing implementation.

- [ ] **Step 4: Update prompt capability sections**

```ts
const localMachine = hasDesktopLocalTools(client)
  ? "You may use declared local machine tools after approval."
  : "You cannot access a local computer in this client.";
```

Include Windows PowerShell guidance only for `platform: "win32"`; state POSIX shell behavior for `darwin` and `linux` when Bash is declared.

- [ ] **Step 5: Run Cloud Remix and legacy-agent regression suites**

Run: `pnpm --dir /Users/am/dev/freestyle-voice/cloud test -- apps/server/src/__tests__/remix-prompt.test.ts apps/server/src/__tests__/remix-route-tools.test.ts apps/server/src/__tests__/agent-client-contract.test.ts apps/server/src/__tests__/agent-prompt.test.ts`

Expected: PASS; `/v2/agent` compatibility tests remain unchanged.

- [ ] **Step 6: Commit the canonical Cloud composition**

```bash
git add apps/server/src/routes/v2/remix apps/server/src/__tests__
git commit -m "feat: make Remix the canonical agent tool surface"
```

### Task 3: Advertise the trusted desktop harness and migrate the workspace

**Files:**
- Modify: `apps/server/src/routes/remix.ts`
- Modify: `apps/electron/src/renderer/src/components/panel.tsx`
- Modify: `apps/electron/src/renderer/src/components/remix-chat.tsx`
- Modify: `apps/electron/src/renderer/src/lib/agent-tools.ts`
- Test: `apps/server/tests/remix-agent-proxy.test.ts`
- Test: `apps/electron/src/renderer/src/remix-thread.test.ts`
- Test: `apps/electron/src/renderer/src/remix-chat-polish.test.ts`

**Interfaces:**
- Consumes Task 1’s `RemixClientCapabilities` and the existing `AgentToolCall` executor.
- Produces one desktop agent run endpoint: `/api/remix`.

- [ ] **Step 1: Write failing desktop proxy and workspace tests**

```ts
it("overwrites renderer capabilities with the full desktop harness", async () => {
  expect(forwarded.client).toEqual({
    platform: process.platform,
    localTools: ["current_time", "emote", "save_file", "Bash", "Read", "Write", "Edit", "Glob", "Grep"],
    supportsDownloadsSave: true,
  });
});

it("sends full Remix workspace turns through /api/remix", async () => {
  expect(workspace).toContain('api: "/api/remix"');
  expect(workspace).not.toContain('api: "/api/agent"');
});
```

- [ ] **Step 2: Run the focused desktop tests and verify they fail**

Run: `pnpm --filter @freestyle-voice/electron test -- remix-thread.test.ts remix-chat-polish.test.ts && pnpm --filter @freestyle-voice/server test -- tests/remix-agent-proxy.test.ts`

Expected: FAIL because `panel.tsx` still uses `/api/agent` and `/api/remix` lacks the local-tool list.

- [ ] **Step 3: Centralize trusted desktop capability injection**

```ts
const DESKTOP_REMIX_LOCAL_TOOLS = ["current_time", "emote", "save_file", "Bash", "Read", "Write", "Edit", "Glob", "Grep"] as const;

client: {
  platform: process.platform,
  localTools: DESKTOP_REMIX_LOCAL_TOOLS,
  supportsDownloadsSave: true,
}
```

The local proxy must discard renderer-supplied local tools. Reuse the same constant in the legacy `/api/agent` proxy where the old contract permits it.

- [ ] **Step 4: Migrate desktop workspace transport to `/api/remix`**

```ts
new DefaultChatTransport({
  api: "/api/remix",
  body: { threadId: thread.id },
  fetch: (input, init) => apiFetch(typeof input === "string" ? input : "/api/remix", init ?? {}),
});
```

Keep `agent-tools.ts` as the single local executor/approval implementation. Both full workspace and pill must use its exact `agentToolTier`, `executeAgentTool`, and `addToolResult` sequence.

- [ ] **Step 5: Run desktop focused tests and typecheck**

Run: `pnpm --filter @freestyle-voice/server test -- tests/remix-agent-proxy.test.ts && pnpm --filter @freestyle-voice/electron test -- remix-thread.test.ts remix-chat-polish.test.ts && pnpm --filter @freestyle-voice/electron typecheck:web`

Expected: PASS.

- [ ] **Step 6: Commit the desktop migration**

```bash
git add apps/server/src/routes/remix.ts apps/electron/src/renderer/src/components/panel.tsx apps/electron/src/renderer/src/components/remix-chat.tsx apps/electron/src/renderer/src/lib/agent-tools.ts apps/server/tests apps/electron/src/renderer/src/*.test.ts
git commit -m "feat: route desktop Remix through canonical agent"
```

### Task 4: Migrate mobile Remix and preserve old-agent compatibility

**Files:**
- Modify: `apps/mobile/src/lib/remix/client.ts`
- Test: `apps/mobile/src/lib/remix/client.test.ts`
- Modify: `/Users/am/dev/freestyle-voice/cloud/apps/server/src/routes/v2/agent/index.ts`
- Test: `/Users/am/dev/freestyle-voice/cloud/apps/server/src/__tests__/agent-client-contract.test.ts`

**Interfaces:**
- Mobile sends optional Remix `client` capabilities with no `localTools`.
- `/v2/agent` keeps its existing request/response and local-tool behavior for released clients.

- [ ] **Step 1: Write failing mobile transport test**

```ts
expect(request).toHaveBeenCalledWith(
  "/v2/remix",
  expect.objectContaining({
    method: "POST",
    body: expect.stringContaining('"platform":"ios"'),
  }),
);
```

- [ ] **Step 2: Run the mobile client test and verify it fails**

Run: `pnpm --filter @freestyle-voice/mobile test -- src/lib/remix/client.test.ts`

Expected: FAIL because mobile calls `/v2/agent`.

- [ ] **Step 3: Point the mobile transport at canonical Remix**

```ts
const response = await cloud.request("/v2/remix", {
  method: "POST",
  body: JSON.stringify({ messages, threadId, firstTurn, context, client: MOBILE_REMIX_CLIENT }),
  signal,
});
```

`MOBILE_REMIX_CLIENT` includes platform and existing connector/keyboard flags but omits `localTools`. Supply the existing mobile context shape rather than manufacturing desktop document data.

- [ ] **Step 4: Verify legacy-agent contract stays compatible**

Run: `pnpm --dir /Users/am/dev/freestyle-voice/cloud test -- apps/server/src/__tests__/agent-client-contract.test.ts && pnpm --filter @freestyle-voice/mobile test -- src/lib/remix/client.test.ts`

Expected: PASS; legacy `/v2/agent` tests still assert prior behavior.

- [ ] **Step 5: Commit the mobile migration**

```bash
git add apps/mobile/src/lib/remix/client.ts apps/mobile/src/lib/remix/client.test.ts
git commit -m "feat: send mobile Remix turns to canonical endpoint"
```

### Task 5: End-to-end compatibility verification and documentation

**Files:**
- Modify: `specs/remix.md`
- Modify: `apps/docs/features/remix.mdx`
- Test: `apps/server/tests/remix-agent-proxy.test.ts`
- Test: `/Users/am/dev/freestyle-voice/cloud/apps/server/src/__tests__/remix-client-contract.test.ts`

**Interfaces:**
- Documents the final one-agent run endpoint and distinct compatibility/resource routes.

- [ ] **Step 1: Write failing behavior assertions for the complete protocol**

```ts
it("keeps old Remix requests operational while a desktop request gains approved local tools", () => {
  expect(remixAgentRequestSchema.parse(legacyRequest).client).toBeUndefined();
  expect(getRemixLocalTools(desktopRequest.client)).toHaveProperty("Bash");
});
```

- [ ] **Step 2: Run focused complete-protocol tests and verify they fail until all migration tasks land**

Run: `pnpm --filter @freestyle-voice/server test -- tests/remix-agent-proxy.test.ts && pnpm --dir /Users/am/dev/freestyle-voice/cloud test -- apps/server/src/__tests__/remix-client-contract.test.ts`

Expected: FAIL before the canonical capability migration; PASS after Tasks 1-4.

- [ ] **Step 3: Update technical and user-facing documentation**

Document that all new desktop/mobile Remix conversations use the canonical Remix route, that local tools are declared capabilities executed locally with approval, and that older clients remain on `/v2/agent` until upgraded. Do not claim Cloud executes local commands.

- [ ] **Step 4: Run complete validation**

Run: `pnpm --filter @freestyle-voice/server test && pnpm --filter @freestyle-voice/electron test && pnpm --filter @freestyle-voice/electron typecheck:web && pnpm --filter @freestyle-voice/mobile test && pnpm --dir /Users/am/dev/freestyle-voice/cloud test && git diff --check`

Expected: PASS with no whitespace errors.

- [ ] **Step 5: Commit documentation and verification changes**

```bash
git add specs/remix.md apps/docs/features/remix.mdx
git commit -m "docs: describe canonical Remix agent"
```

## Plan self-review

- Spec coverage: Tasks 1-4 cover optional capabilities, Cloud/local ownership, desktop and mobile migration, and legacy endpoint compatibility. Task 5 covers durable documentation and full verification.
- Placeholder scan: no deferred implementation markers or unnamed tests remain.
- Type consistency: every task uses `RemixClientCapabilities`, `getRemixLocalTools`, `localTools`, and `/v2/remix` consistently.
