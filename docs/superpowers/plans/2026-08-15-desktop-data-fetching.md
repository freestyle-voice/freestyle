# Desktop Data Fetching Consistency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make cacheable Electron renderer reads query-backed, cursor-paginate growing collections, and show layout-preserving loading states.

**Architecture:** `lib/query.ts` is the canonical key and option registry. Endpoint clients provide typed page/read functions; React Query owns read lifecycles and mutation invalidation. A shared skeleton component supplies initial-load placeholders, while existing connector-specific skeletons remain unchanged.

**Tech Stack:** React 19, TanStack React Query v5, TypeScript, Vitest, Electron Vite.

**Spec:** `docs/superpowers/specs/2026-08-15-desktop-data-fetching-design.md`

## Global Constraints

- Do not add `nuqs`; Electron panel navigation is not URL-driven.
- Keep raw `apiFetch` only for streaming, telemetry, uploads, and one-shot actions.
- Keep the one-hour default query cache policy; connector data remains five-minute fresh.
- Preserve existing signed-out, error, and empty-state copy.
- Use API cursors for thread history and connector search; never infer a next page from item count.

---

### Task 1: Add cached endpoint clients and pagination option factories

**Files:**
- Create: `apps/electron/src/renderer/src/lib/threads.ts`
- Create: `apps/electron/src/renderer/src/lib/threads.test.ts`
- Create: `apps/electron/src/renderer/src/lib/notifications.ts`
- Create: `apps/electron/src/renderer/src/lib/notifications.test.ts`
- Modify: `apps/electron/src/renderer/src/lib/query.ts`
- Modify: `apps/electron/src/renderer/src/lib/connectors.test.ts`

**Interfaces:**
- Produces `listThreads({ cursor?, limit? })`, `getLatestThread()`, and `getThread(id)`.
- Produces `listNotificationHistory()` with `ready`, `signed-out`, and `unreachable` outcomes.
- Produces `threadHistoryInfiniteQueryOptions()`, `latestThreadQueryOptions()`, `threadQueryOptions(id)`, `notificationHistoryQueryOptions()`, and `connectorSearchInfiniteQueryOptions(search)`.

- [ ] **Step 1: Write failing clients tests**

```ts
it("passes a thread cursor through and returns the server next cursor", async () => {
  apiFetch.mockResolvedValue(jsonResponse({ threads: [], nextCursor: 42 }));
  await expect(listThreads({ cursor: 20, limit: 24 })).resolves.toEqual({
    threads: [], nextCursor: 42,
  });
  expect(apiFetch).toHaveBeenCalledWith("/api/agent/thread/list?limit=24&cursor=20");
});
```

- [ ] **Step 2: Run tests and verify they fail for missing clients**

Run: `pnpm --filter @freestyle-voice/electron test -- threads.test.ts notifications.test.ts`

Expected: FAIL with unresolved `./threads` and `./notifications` imports.

- [ ] **Step 3: Implement minimal typed endpoint clients**

```ts
export async function listThreads({ cursor, limit = 24 }: ThreadPageInput = {}) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor !== undefined) params.set("cursor", String(cursor));
  return responseJson<ThreadPage>(await apiFetch(`/api/agent/thread/list?${params}`));
}
```

Normalize notification HTTP 401 and unavailable responses into an explicit discriminated result.

- [ ] **Step 4: Add query keys and options**

```ts
threads: {
  all: ["threads"] as const,
  latest: ["threads", "latest"] as const,
  list: ["threads", "list"] as const,
  detail: (id: string) => ["threads", "detail", id] as const,
},
notifications: { history: ["notifications", "history"] as const },
```

Use `initialPageParam: null` and `getNextPageParam: (page) => page.nextCursor ?? undefined`.

- [ ] **Step 5: Change connector search to `useInfiniteQuery` options**

```ts
export function connectorSearchInfiniteQueryOptions(search: string) {
  return {
    queryKey: queryKeys.connectors.search(search),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }: { pageParam: string | null }) =>
      listConnectorCatalog({ search, cursor: pageParam ?? undefined, limit: 50 }),
    getNextPageParam: (page: ConnectorCatalogPage) => page.nextCursor ?? undefined,
    enabled: search.length > 0,
  };
}
```

- [ ] **Step 6: Run focused tests and commit**

Run: `pnpm --filter @freestyle-voice/electron test -- threads.test.ts notifications.test.ts connectors.test.ts`

Expected: PASS.

```bash
git add apps/electron/src/renderer/src/lib
git commit -m "feat(renderer): Add cached paginated data clients"
```

### Task 2: Migrate settings, notification history, and threads to React Query

**Files:**
- Create: `apps/electron/src/renderer/src/components/data-skeleton.tsx`
- Create: `apps/electron/src/renderer/src/lib/query-state.test.ts`
- Modify: `apps/electron/src/renderer/src/components/settings-view.tsx`
- Modify: `apps/electron/src/renderer/src/components/notifications-history.tsx`
- Modify: `apps/electron/src/renderer/src/components/panel.tsx`
- Modify: `apps/electron/src/renderer/src/tavern.css`

**Interfaces:**
- Consumes Task 1 options and existing `settingsQueryOptions()`.
- Produces `DataSkeleton({ variant: "rows" | "panel", label: string })`.
- Settings mutations optimistically set `queryKeys.settings`, roll back on error, and invalidate on settlement.

- [ ] **Step 1: Write failing pure state tests**

```ts
expect(replaceSetting({ language: "en", theme: "dark" }, "theme", "light"))
  .toEqual({ language: "en", theme: "light" });
expect(flattenPages([{ threads: [{ id: "a" }] }, { threads: [{ id: "b" }] }]))
  .toEqual([{ id: "a" }, { id: "b" }]);
```

- [ ] **Step 2: Run tests and verify the missing helper exports fail**

Run: `pnpm --filter @freestyle-voice/electron test -- query-state.test.ts`

Expected: FAIL because `replaceSetting` and `flattenPages` do not exist.

- [ ] **Step 3: Query-cache settings with an optimistic mutation**

Use `useQuery(settingsQueryOptions())` and `useMutation`. Save the previous map in `onMutate`, restore it in `onError`, invalidate in `onSettled`, and call `reloadDictationPrefs()` only after success.

- [ ] **Step 4: Query-cache notifications and thread views**

Render notification result states from `useQuery`. Boot the panel from the latest query, cache IPC-opened detail data with `setQueryData`, and render history with `useInfiniteQuery`. Add a keyboard-accessible “Load more conversations” button when `hasNextPage` is true.

- [ ] **Step 5: Add and apply the shared skeleton**

Render the skeleton only when the relevant query lacks data. Keep cached content on background refetch; add reduced-motion styling and `aria-busy="true"` to the owning region.

- [ ] **Step 6: Run focused tests, typecheck, and commit**

Run: `pnpm --filter @freestyle-voice/electron test -- query-state.test.ts threads.test.ts notifications.test.ts`

Run: `pnpm --filter @freestyle-voice/electron typecheck`

Expected: PASS.

```bash
git add apps/electron/src/renderer/src/components apps/electron/src/renderer/src/lib apps/electron/src/renderer/src/tavern.css
git commit -m "refactor(renderer): Query-cache settings and conversation views"
```

### Task 3: Query-cache brain-derived views and their loading states

**Files:**
- Modify: `apps/electron/src/renderer/src/lib/brain-fs.ts`
- Modify: `apps/electron/src/renderer/src/lib/brain-fs.test.ts`
- Modify: `apps/electron/src/renderer/src/lib/query.ts`
- Modify: `apps/electron/src/renderer/src/components/notes-tab.tsx`
- Modify: `apps/electron/src/renderer/src/components/todos-tab.tsx`
- Modify: `apps/electron/src/renderer/src/components/scheduled-tasks.tsx`
- Modify: `apps/electron/src/renderer/src/components/opener-cards.tsx`

**Interfaces:**
- Produces `brain.files(prefix)`, `brain.file(path)`, `brain.notes`, `brain.todos`, and `brain.scheduled` query keys/options.
- Produces `invalidateBrainQueries(queryClient, path?)` so successful writes invalidate both a file and derived lists.

- [ ] **Step 1: Write failing cache-invalidation tests**

```ts
it("reuses a cached file read without another request", async () => {
  apiFetch.mockResolvedValue(jsonResponse({ ok: true, text: "note" }));
  await readBrainFile("notes/a.md");
  await readBrainFile("notes/a.md");
  expect(apiFetch).toHaveBeenCalledTimes(1);
});
```

Also assert a successful write triggers the new invalidation helper for the matching file and collection.

- [ ] **Step 2: Run the focused test and verify the new helper is absent**

Run: `pnpm --filter @freestyle-voice/electron test -- brain-fs.test.ts`

Expected: FAIL because the Query invalidation helper does not exist.

- [ ] **Step 3: Implement brain query options and derived readers**

Use existing `listBrainFiles`/`readBrainFile` as query functions, retaining the 60-second L1 cache. Derived notes and scheduled queries use `Promise.all`, sort deterministically, and throw on load failure rather than treating failure as an empty list.

- [ ] **Step 4: Replace component loaders with query/mutation state**

Notes, todos, and scheduled tasks use `useQuery` for first load and mutations for writes. Mutations update their local cache optimistically and call `invalidateBrainQueries` on settlement. Use `DataSkeleton` for first loads. Replace the empty busy opener region with a visible skeleton.

- [ ] **Step 5: Run focused tests, typecheck, and commit**

Run: `pnpm --filter @freestyle-voice/electron test -- brain-fs.test.ts`

Run: `pnpm --filter @freestyle-voice/electron typecheck`

Expected: PASS.

```bash
git add apps/electron/src/renderer/src/lib apps/electron/src/renderer/src/components
git commit -m "refactor(renderer): Query-cache brain workspace views"
```

### Task 4: Finish connector-search pagination and verify the PR

**Files:**
- Modify: `apps/electron/src/renderer/src/components/connected-apps.tsx`
- Modify: `apps/electron/src/renderer/src/lib/connectors.test.ts`
- Modify: `apps/electron/src/renderer/src/tavern.css`

**Interfaces:**
- Consumes `connectorSearchInfiniteQueryOptions(search)` from Task 1.
- Produces independent browse and search sentinels; only the active mode observes its sentinel.

- [ ] **Step 1: Write the failing search-page flattening test**

```ts
expect(flattenConnectorPages([
  { connectors: [{ slug: "gmail" }], nextCursor: "one" },
  { connectors: [{ slug: "slack" }], nextCursor: null },
])).toEqual([{ slug: "gmail" }, { slug: "slack" }]);
```

- [ ] **Step 2: Run the connector test and verify it fails**

Run: `pnpm --filter @freestyle-voice/electron test -- connectors.test.ts`

Expected: FAIL because search still treats results as one page.

- [ ] **Step 3: Render flattened search pages and a search sentinel**

Use `hasNextPage`, `isFetchingNextPage`, and `fetchNextPage`. Include browse-query loading in the initial-loading condition so catalog-only waits retain the current connector skeleton.

- [ ] **Step 4: Run full verification and inspect the diff**

Run: `pnpm --filter @freestyle-voice/electron test`

Run: `pnpm --filter @freestyle-voice/electron typecheck`

Run: `pnpm test`

Run: `git diff --check && git status --short`

Expected: all commands exit 0; changes are limited to this plan’s renderer code, tests, CSS, `.gitignore`, and design/plan documents.

- [ ] **Step 5: Commit final implementation**

```bash
git add apps/electron/src/renderer/src/components/connected-apps.tsx apps/electron/src/renderer/src/lib/connectors.test.ts apps/electron/src/renderer/src/tavern.css
git commit -m "feat(renderer): Paginate connected-app search"
```
