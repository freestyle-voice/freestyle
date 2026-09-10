# Remix Workspace Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the main Remix workspace easier to scan during real, tool-heavy work without reducing the audit trail or changing agent behavior.

**Architecture:** Keep chat message rendering authoritative in `remix-chat.tsx`, adding a summary layer above the existing `AgentActivity` disclosure rather than changing tool events. Treat context rail layout as workspace CSS plus small presentational branching, and keep Models/Schedules as independent page-level presentation changes. Extend the existing isolated Electron visual harness with deterministic fixtures for every reviewed state.

**Tech Stack:** React, TypeScript, Tailwind/shadcn, CSS custom properties, TanStack Query, Playwright Electron.

**Spec:** `docs/superpowers/specs/2026-09-10-remix-workspace-polish.md`

## Global Constraints

- Preserve all existing local-action approval, complete-command review, queue, reconnect, and agent-tool semantics.
- Do not send user data, create schedules, invoke connected-app tools, or modify account configuration during implementation or automated verification.
- Use transform/opacity-only motion and disable nonessential animation for `prefers-reduced-motion`.
- Preserve the existing dark editorial visual language and current CSS tokens.
- Keep all work local; do not commit, push, or create a PR.

---

### Task 1: Summarize Remix tool activity without hiding details

**Files:**
- Modify: `apps/electron/src/renderer/src/components/remix-chat.tsx:1402-1585`
- Test: `apps/electron/src/renderer/src/remix-chat-polish.test.ts`

**Interfaces:**
- Consumes: `ToolUIPart | DynamicToolUIPart`, `getToolOrDynamicToolName`, and `AgentActivity`.
- Produces: `toolActivitySummary(parts)` returning visible count, repeated-provider count, active label, and failure count for `ToolActivity`.

- [ ] **Step 1: Write failing summary tests**

Add source-contract tests asserting that `ToolActivity` renders one concise summary before its disclosure, includes the total action count, labels active work, and marks failed actions as attention-worthy.

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `pnpm --filter @freestyle-voice/electron exec vitest run src/renderer/src/remix-chat-polish.test.ts`

Expected: FAIL because `toolActivitySummary` and the summary markup do not exist.

- [ ] **Step 3: Implement the minimum summary layer**

Add a pure `toolActivitySummary` helper beside `ToolActivity`. Render a concise button-like summary containing the action count, provider/tool grouping, active progress, and failure state. Keep the existing `AgentActivity` as the only detailed action list and default it closed once the turn is complete; keep it open while a tool is active or has failed.

- [ ] **Step 4: Style the summary and details**

Use the existing `remix-chat-*` CSS string in `remix-chat.tsx`. Give summary hover/focus states, active and failure accent states, and a 140–180ms transform/opacity transition. Add reduced-motion overrides next to the existing chat motion rules.

- [ ] **Step 5: Run focused tests**

Run: `pnpm --filter @freestyle-voice/electron exec vitest run src/renderer/src/remix-chat-polish.test.ts`

Expected: PASS.

### Task 2: Make the context rail yield space and reduce empty-state density

**Files:**
- Modify: `apps/electron/src/renderer/src/components/remix-context-rail.tsx:366-430`
- Modify: `apps/electron/src/renderer/src/remix-workspace.css:597-665`
- Test: `apps/electron/src/renderer/src/components/remix-context-rail.test.ts`

**Interfaces:**
- Consumes: `RemixRunState`, task/note/brain counts, and `open` context state.
- Produces: `data-empty` attributes for empty context cards and a non-overlapping `.is-context-open` workspace layout.

- [ ] **Step 1: Write failing context tests**

Add tests that assert no-active-run, zero-task, and zero-note cards expose `data-empty="true"`, while active/attention run state does not. Assert that the context rail remains an accessible complementary region.

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `pnpm --filter @freestyle-voice/electron exec vitest run src/renderer/src/components/remix-context-rail.test.ts`

Expected: FAIL because empty-state attributes are absent.

- [ ] **Step 3: Implement compact empty cards**

Apply `data-empty` to Run, Tasks, and Notes cards when their content is empty. Retain their controls and accessible labels, but remove decorative card body padding and use compact one-line helper copy.

- [ ] **Step 4: Reserve workspace width for the rail**

Replace the desktop absolute-overlay behavior with a flex/grid width reservation under `.is-context-open`, retaining the existing overlay behavior below the responsive breakpoint. Keep the rail’s open/close transition transform/opacity-only and preserve the existing reduced-motion branch.

- [ ] **Step 5: Run focused tests**

Run: `pnpm --filter @freestyle-voice/electron exec vitest run src/renderer/src/components/remix-context-rail.test.ts`

Expected: PASS.

### Task 3: Align loading conversation geometry with chat content

**Files:**
- Modify: `apps/electron/src/renderer/src/components/panel.tsx`
- Modify: `apps/electron/src/renderer/src/remix-workspace.css`
- Test: `apps/electron/src/renderer/src/startup-rendering.test.ts`

**Interfaces:**
- Consumes: current loading conversation state and Remix workspace tokens.
- Produces: an accessible `Loading conversation` skeleton whose lines correspond to user and assistant message widths.

- [ ] **Step 1: Write a failing loading-state assertion**

Extend `startup-rendering.test.ts` to require a labelled loading conversation, a compact user-message placeholder, two assistant text lines, and no `animate-pulse` class in the Remix conversation skeleton.

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `pnpm --filter @freestyle-voice/electron exec vitest run src/renderer/src/startup-rendering.test.ts`

Expected: FAIL because the skeleton does not expose the required message-shape markers.

- [ ] **Step 3: Implement message-shaped skeleton markup and CSS**

Replace the broad top glow with message-sized placeholder groups. Animate a subtle sheen by translating its pseudo-element; stop the animation under `prefers-reduced-motion`.

- [ ] **Step 4: Run focused tests**

Run: `pnpm --filter @freestyle-voice/electron exec vitest run src/renderer/src/startup-rendering.test.ts`

Expected: PASS.

### Task 4: Clarify independent Remix runtime in Models

**Files:**
- Modify: `apps/electron/src/renderer/src/pages/models/index.tsx`
- Modify: `apps/electron/src/renderer/src/pages/models/remix-model-card.tsx`
- Test: `apps/electron/src/renderer/src/pages/models/models-shared-role.test.ts`

**Interfaces:**
- Consumes: `ConfiguredModel | undefined` and existing `configureModel(..., "remix")` behavior.
- Produces: explicit Dictation and Remix Runtime section copy; no changed model-selection handlers.

- [ ] **Step 1: Write failing model-page tests**

Add tests for Cloud and local Remix runtime cards that require the phrases `Dictation models` and `Remix runtime`, identify the session-storage consequence, and preserve `Choose a model`, `Change model`, and `Use Cloud` callbacks.

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `pnpm --filter @freestyle-voice/electron exec vitest run src/renderer/src/pages/models/models-shared-role.test.ts`

Expected: FAIL because the Dictation group/copy is not present.

- [ ] **Step 3: Implement hierarchy-only copy and structure**

Wrap the current Freestyle Cloud bundle and paired voice/cleanup cards in a `Dictation models` group. Keep `RemixModelCard` in a clearly separate `Remix runtime` group and make its Cloud/local copy explicit. Do not alter `configureFreestyleRemix`, `configureModel`, or auth flows.

- [ ] **Step 4: Run focused tests**

Run: `pnpm --filter @freestyle-voice/electron exec vitest run src/renderer/src/pages/models/models-shared-role.test.ts`

Expected: PASS.

### Task 5: Make workspace schedules scan status before instructions

**Files:**
- Modify: `apps/electron/src/renderer/src/components/scheduled-tasks.tsx:479-526`
- Modify: `apps/electron/src/renderer/src/tavern.css`
- Test: `apps/electron/src/renderer/src/components/scheduled-tasks.test.tsx`

**Interfaces:**
- Consumes: `ScheduledTaskView` and existing run-now/update/delete handlers.
- Produces: a collapsed `Task instructions` disclosure; unchanged action callbacks and accessible labels.

- [ ] **Step 1: Write failing schedule-card tests**

Add a workspace-card rendering test that requires a collapsed `Task instructions` disclosure, verifies the instruction appears once inside it, and confirms `Run <name> now`, edit, enable, and delete controls retain their existing labels.

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `pnpm --filter @freestyle-voice/electron exec vitest run src/renderer/src/components/scheduled-tasks.test.tsx`

Expected: FAIL because workspace cards render the complete instruction as a paragraph.

- [ ] **Step 3: Implement progressive instruction disclosure**

Render the schedule cadence, state, timing, and primary actions first. Replace the visible prompt paragraph with a native `details` element labelled `Task instructions`; leave its text and all handlers unchanged. Style the disclosure as a lightweight divider, not a second card.

- [ ] **Step 4: Run focused tests**

Run: `pnpm --filter @freestyle-voice/electron exec vitest run src/renderer/src/components/scheduled-tasks.test.tsx`

Expected: PASS.

### Task 6: Extend visual coverage and perform safe live verification

**Files:**
- Modify: `apps/electron/tests/dashboard-visual.test.ts`
- Test: `apps/electron/tests/dashboard-visual.test.ts`

**Interfaces:**
- Consumes: the existing isolated Electron fixture server.
- Produces: deterministic screenshots for loaded Remix activity/context, conversation loading, local/cloud Remix runtime, and expanded schedule instructions.

- [ ] **Step 1: Update fixture state**

Set completed onboarding in `/api/settings`; provide one named thread with completed tool events, one active run, one task/note/brain fixture, Cloud and local runtime variants, and one schedule. Do not use real account data or invoke live tools.

- [ ] **Step 2: Add semantic assertions and screenshots**

Assert that normal routes do not redirect to onboarding, the activity summary is visible, details expand on demand, the rail is visible without covering the conversation container, runtime copy changes by fixture, and schedule instructions expand. Attach named PNGs for each state.

- [ ] **Step 3: Run the visual suite**

Run: `pnpm --filter @freestyle-voice/electron exec playwright test tests/dashboard-visual.test.ts --reporter=list`

Expected: PASS with the expanded screenshot set.

- [ ] **Step 4: Build and run static checks**

Run: `pnpm --filter @freestyle-voice/electron build`

Expected: PASS. If the pre-existing `"remix"` type error remains, report it separately as a release blocker and still run renderer-targeted tests.

- [ ] **Step 5: Exercise queue/reconnect safely in the live Electron app**

Send exactly this Remix message: `Reply with exactly: Remix UI verification acknowledged. Do not use tools, connected apps, local actions, or browser access.` Then, while it is pending, queue the same harmless sentence once through the supported queue UI. Observe queue display and reconnect/retry affordances only; do not trigger disconnected network conditions, approve actions, or send further prompts.
