# Attention Run Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a secure, backward-compatible attention snapshot that turns durable
turns, pending actions, scheduled runs, and connection health into one compact
Remix surface.

**Architecture:** Cloud derives a bounded read-only projection from existing
durable tables; it does not introduce another work-state store. Desktop proxies
the endpoint through its authenticated local server and renders it through one
React Query cache, preserving stale content during a refresh.

**Tech Stack:** Cloudflare Workers, Hono, Drizzle/D1, Zod, React, TanStack
Query, Vitest, Electron local server.

**Spec:** `specs/attention-run-center.md`

## Global Constraints

- Do not modify existing `/v2/agent`, `/v2/remix`, scheduled, or Courier
  endpoint contracts.
- Scope every source query to authenticated `userId`.
- Return display-safe metadata only; never return tool input, OAuth/MCP
  credentials, or prompt content.
- Limit the response to 25 items and order it deterministically.
- Keep stale data rendered during background refetch.

---

### Task 1: Define and verify the versioned attention response contract

**Files:**
- Create: `packages/validations/src/attention.ts`
- Modify: `packages/validations/src/index.ts`
- Test: `packages/validations/src/attention.test.ts`

**Interfaces:**
- Produces Cloud's `attentionSnapshotSchema`, `attentionItemSchema`, and
  exported response types. Desktop will independently parse this additive HTTP
  contract rather than importing a package from another repository.

- [ ] **Step 1: Write the failing contract test**

```ts
expect(attentionSnapshotSchema.safeParse({
  generatedAt: "2026-09-01T00:00:00.000Z",
  items: [{
    id: "action:abc",
    kind: "approval",
    priority: "requires_action",
    status: "waiting",
    title: "Approve action",
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    target: { type: "thread", threadId: "thread-1", actionId: "action-1" },
  }],
}).success).toBe(true);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @freestyle/validations test -- attention.test.ts`

Expected: failure because `attentionSnapshotSchema` does not exist.

- [ ] **Step 3: Add the discriminated target schema and item schema**

```ts
export const attentionTargetSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("thread"), threadId: z.string(), turnId: z.string().optional(), actionId: z.string().optional() }),
  z.object({ type: z.literal("scheduled"), taskId: z.string(), runId: z.string(), threadId: z.string().optional() }),
  z.object({ type: z.literal("connection"), connectionId: z.string() }),
]);
```

- [ ] **Step 4: Run validation tests and build**

Run: `pnpm --filter @freestyle/validations test -- attention.test.ts && pnpm --filter @freestyle/validations build`

Expected: both commands exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/validations/src/attention.ts packages/validations/src/attention.test.ts packages/validations/src/index.ts
git commit -m "feat(attention): Define shared snapshot contract"
```

### Task 2: Derive attention in Cloud

**Files:**
- Create: `apps/server/src/attention/store.ts`
- Create: `apps/server/src/routes/v2/attention/index.ts`
- Modify: `apps/server/src/routes/v2/index.ts`
- Test: `apps/server/src/__tests__/attention.test.ts`

**Interfaces:**
- Consumes the shared attention contract and the existing
  `threadTurns`, `threadActionRequests`, `scheduledTaskRuns`, and
  `connectorConnections` tables.
- Produces `listAttention(db, userId, now)` and `GET /v2/attention`.

- [ ] **Step 1: Write failing ownership, order, and limit tests**

```ts
const response = await app.request("/v2/attention", { headers: authHeaders(owner) });
expect(response.status).toBe(200);
expect((await response.json()).items.map((item) => item.id)).toEqual([
  "action:pending", "turn:failed", "turn:running", "connection:inactive",
]);
```

Add an assertion that another user's response never contains
`action:pending`, and a fixture with 26 records asserting 25 results.

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `pnpm --filter @freestyle/server test -- attention.test.ts`

Expected: 404 because the route is not registered.

- [ ] **Step 3: Implement independently bounded, owner-scoped source queries**

```ts
export async function listAttention(db: Db, userId: string, now = new Date()) {
  const [actions, turns, scheduled, connections] = await Promise.all([
    listPendingActions(db, userId, now),
    listRelevantTurns(db, userId, now),
    listRelevantScheduledRuns(db, userId, now),
    listInactiveConnections(db, userId),
  ]);
  return {
    generatedAt: now.toISOString(),
    items: orderAttention([...actions, ...turns, ...scheduled, ...connections]).slice(0, 25),
  };
}
```

Each query selects only stable identifiers, display-safe labels, status, and
timestamps. Register the authenticated `GET /v2/attention` route.

- [ ] **Step 4: Run focused tests and typecheck**

Run: `pnpm --filter @freestyle/server test -- attention.test.ts && pnpm --filter @freestyle/server exec tsc --noEmit`

Expected: both commands exit 0.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/attention/store.ts apps/server/src/routes/v2/attention/index.ts apps/server/src/routes/v2/index.ts apps/server/src/__tests__/attention.test.ts
git commit -m "feat(attention): Add authenticated work snapshot"
```

### Task 3: Proxy and independently parse the snapshot on Desktop

**Files:**
- Create: `apps/server/src/routes/attention.ts`
- Modify: `apps/server/src/routes/index.ts`
- Modify: `apps/electron/src/renderer/src/lib/query.ts`
- Test: `apps/server/tests/attention-proxy.test.ts`
- Test: `apps/electron/src/renderer/src/lib/query.test.ts`

**Interfaces:**
- Consumes Cloud `GET /v2/attention` via the existing session-token proxy and
  validates the public response locally without a cross-repository package dependency.
- Produces `GET /api/attention`, `queryKeys.attention.snapshot`, and
  `attentionQueryOptions()`.

- [ ] **Step 1: Write failing proxy and query-key tests**

```ts
expect(fetchMock).toHaveBeenCalledWith(
  expect.stringContaining("/v2/attention"),
  expect.objectContaining({ headers: expect.objectContaining({ Authorization: expect.stringMatching(/^Bearer /) }) }),
);
expect(attentionQueryOptions().queryKey).toEqual(queryKeys.attention.snapshot);
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @freestyle-voice/server test -- attention-proxy.test.ts && pnpm --filter @freestyle-voice/electron test -- query.test.ts`

Expected: failures because the proxy and query options are absent.

- [ ] **Step 3: Implement the narrow proxy and one query cache**

```ts
export const attentionQueryOptions = () => queryOptions({
  queryKey: queryKeys.attention.snapshot,
  queryFn: () => apiFetch("/api/attention").then(parseAttentionSnapshot),
  staleTime: 15_000,
  refetchOnWindowFocus: true,
});
```

Mirror established authenticated Cloud proxies: invalidate a stale session on
401, preserve upstream safe JSON/status, and never expose the bearer token.

- [ ] **Step 4: Run focused proxy and renderer tests**

Run: `pnpm --filter @freestyle-voice/server test -- attention-proxy.test.ts && pnpm --filter @freestyle-voice/electron test -- query.test.ts`

Expected: both commands exit 0.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/routes/attention.ts apps/server/src/routes/index.ts apps/server/tests/attention-proxy.test.ts apps/electron/src/renderer/src/lib/query.ts apps/electron/src/renderer/src/lib/query.test.ts
git commit -m "feat(attention): Proxy the shared work snapshot"
```

### Task 4: Render the compact Remix attention section

**Files:**
- Create: `apps/electron/src/renderer/src/components/attention-home.tsx`
- Create: `apps/electron/src/renderer/src/components/attention-home.test.tsx`
- Modify: `apps/electron/src/renderer/src/components/panel.tsx`
- Modify: `apps/electron/src/renderer/src/tavern.css`

**Interfaces:**
- Consumes `attentionQueryOptions()`.
- Produces `AttentionHome`, opening existing thread/settings targets and
  invalidating only `queryKeys.attention.snapshot` after relevant mutations.

- [ ] **Step 1: Write loading, stale-data, empty-state, and navigation tests**

```tsx
render(<AttentionHome />, { query: pendingAttentionQuery() });
expect(screen.getByTestId("attention-skeleton")).toBeVisible();

render(<AttentionHome />, { query: staleAttentionQuery([approvalItem]) });
expect(screen.getByText("Approve action")).toBeVisible();
expect(screen.queryByText("Loading")).not.toBeInTheDocument();
```

- [ ] **Step 2: Run the component test to verify it fails**

Run: `pnpm --filter @freestyle-voice/electron test -- attention-home.test.tsx`

Expected: failure because `AttentionHome` is absent.

- [ ] **Step 3: Implement the small section and shape-matched skeleton**

Render no more than five items. Omit the card when the feed is empty. During
refetch, show cached items with a subtle refresh state; only an empty initial
cache may render a skeleton.

- [ ] **Step 4: Run the focused UI test and Electron typecheck**

Run: `pnpm --filter @freestyle-voice/electron test -- attention-home.test.tsx && pnpm --filter @freestyle-voice/electron exec tsc --noEmit`

Expected: both commands exit 0.

- [ ] **Step 5: Commit**

```bash
git add apps/electron/src/renderer/src/components/attention-home.tsx apps/electron/src/renderer/src/components/attention-home.test.tsx apps/electron/src/renderer/src/components/panel.tsx apps/electron/src/renderer/src/tavern.css
git commit -m "feat(remix): Show work needing attention"
```

### Task 5: Run compatibility regression checks

**Files:**
- Modify: `README.md` only if the visible Remix workflow needs a concise note.
- Test: existing durable-turn, scheduled, notification, and Remix suites.

**Interfaces:**
- Verifies existing public contracts remain unchanged.

- [ ] **Step 1: Run compatibility suites**

Run: `pnpm --filter @freestyle/server test -- durable-turns-route.test.ts scheduled-run-now.test.ts notifications-route.test.ts remix-client-contract.test.ts attention.test.ts`

Run: `pnpm --filter @freestyle-voice/server test -- remix-agent-proxy.test.ts attention-proxy.test.ts`

Run: `pnpm --filter @freestyle-voice/electron test -- attention-home.test.tsx remix-chat-polish.test.ts companion-observer.test.ts`

Expected: every command exits 0.

- [ ] **Step 2: Run formatting and diff checks**

Run: `pnpm exec biome check apps packages && git diff --check`

Expected: both commands exit 0.

- [ ] **Step 3: Commit verification or documentation changes**

```bash
git add README.md
git commit -m "docs(remix): Describe work attention surface"
```
