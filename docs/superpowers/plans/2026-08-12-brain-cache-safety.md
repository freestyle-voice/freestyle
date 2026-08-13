# Brain Cache Safety Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent Brain Files edits from serving stale Todos or Notes data, while keeping the renderer's short-lived cache bounded.

**Architecture:** Keep cache lifecycle ownership in `brain-fs.ts`. Successful raw `write` and `delete` calls update or invalidate the shared cache, so both specialized tabs and the Settings file editor behave consistently. Bound cached file contents with deterministic oldest-entry eviction.

**Tech Stack:** TypeScript, Vitest, Electron renderer.

## Global Constraints

- Preserve the 60-second warm-cache behavior added in PR #572.
- Do not alter the Brain API contract or UI behavior beyond cache freshness.
- Tests must exercise `brain-fs.ts` behavior with the network boundary mocked.

---

### Task 1: Cover cache mutation and retention behavior

**Files:**
- Create: `apps/electron/src/renderer/src/lib/brain-fs.test.ts`
- Modify: `apps/electron/src/renderer/src/lib/brain-fs.ts`

**Interfaces:**
- Consumes: `fsCall(route, body)`, `readBrainFile(path)`, `listBrainFiles()`, `peekBrainFile(path)`, and `peekBrainFiles()`.
- Produces: regression coverage for cache invalidation and bounded read retention.

- [ ] **Step 1: Write the failing tests**

```ts
it("updates cached file contents and invalidates cached lists after a raw write", async () => {
  await readBrainFile("notes/a.md");
  await listBrainFiles();
  await fsCall("write", { path: "notes/a.md", text: "new" });
  expect(peekBrainFile("notes/a.md")).toBe("new");
  expect(peekBrainFiles()).toBeUndefined();
});

it("evicts the oldest cached read when the cache reaches its capacity", async () => {
  // Read one more unique path than the defined cache capacity.
  expect(peekBrainFile("notes/0.md")).toBeUndefined();
});
```

- [ ] **Step 2: Run the targeted test file and verify it fails**

Run: `pnpm --filter @freestyle-voice/electron exec vitest run src/renderer/src/lib/brain-fs.test.ts`

Expected: FAIL because raw writes do not update cached contents or invalidate the list, and the read cache has no capacity bound.

- [ ] **Step 3: Implement the smallest shared cache lifecycle changes**

```ts
// On a successful fsCall("write"), refresh that path and invalidate the list.
// On a successful fsCall("delete"), remove that path and invalidate the list.
// Before adding a new read, evict the oldest entry when the read cache is full.
```

- [ ] **Step 4: Run the targeted test file and verify it passes**

Run: `pnpm --filter @freestyle-voice/electron exec vitest run src/renderer/src/lib/brain-fs.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/electron/src/renderer/src/lib/brain-fs.ts apps/electron/src/renderer/src/lib/brain-fs.test.ts docs/superpowers/plans/2026-08-12-brain-cache-safety.md
git commit -m "fix(electron): keep brain cache coherent"
```

### Task 2: Validate the renderer change

**Files:**
- Modify: `apps/electron/src/renderer/src/lib/brain-fs.ts`
- Test: `apps/electron/src/renderer/src/lib/brain-fs.test.ts`

**Interfaces:**
- Consumes: completed Task 1 cache contract.
- Produces: type-safe, formatted renderer code with all Electron tests passing.

- [ ] **Step 1: Run focused and package tests**

Run: `pnpm --filter @freestyle-voice/electron test`

Expected: PASS with no failing test files.

- [ ] **Step 2: Run formatting and renderer typecheck**

Run: `pnpm exec biome check apps/electron/src/renderer/src/lib/brain-fs.ts apps/electron/src/renderer/src/lib/brain-fs.test.ts && pnpm --filter @freestyle-voice/electron typecheck:web`

Expected: both commands exit 0.
