# Remove Remix Agent Implementation Plan

> **For agentic workers:** Use focused implementation tasks and a whole-branch review. Steps use checkbox syntax for tracking.

**Goal:** Remove Remix from this repo and leave a working dictation application.

**Architecture:** Delete agent-only surfaces and simplify mixed code around the existing dictation path. Preserve persisted data and database migration compatibility. Desktop, native integration, mobile, and local server have separate ownership boundaries for implementation; integrate their public contracts before final checks.

**Tech Stack:** Electron, React, TypeScript, Hono, Expo SDK 57, Swift, pnpm, Vitest, Playwright.

**Spec:** `specs/remove-remix-agent-design.md` (approved by the user).

## Global Constraints

- Base on `f997c012`, the latest fetched main commit.
- Keep dictation, cleanup, model settings, history, vocabulary/dictionary, onboarding, billing/auth, and dictation plugins working.
- Preserve stored user data and historical migrations; do not change the separate cloud service.
- Keep `specs/local-audio-workspace-research.md` out of the PR.
- Read pinned Expo SDK 57 docs before mobile code changes.

## Review Focus

- Old Remix workspace preferences and deep links must resolve to dictation.
- Dictation native focus, Escape/cancel, hold/toggle hotkeys, and overlay sizing must survive removal of shared Remix handlers.
- Keyboard extension background sessions and insertion acknowledgements must survive removal of conversational turns.
- Existing model rows with `type=remix` must not appear in cleanup/speech configuration or break migration reads.
- Removed client routes must not leave startup loops, network activity, stale links, or orphaned imports in published bundles.

### Task 1: Desktop renderer

**Files:** `apps/electron/src/renderer/**`, desktop browser tests/config, Electron dependency manifest (coordinate lockfile centrally).

**Interfaces:** Consumes remaining dictation IPC from task 2 and voice/llm server model APIs from task 4. Produces a single Dictate shell and safe `/remix` redirect.

- [x] Update workspace/startup navigation tests for dictation-only startup and legacy redirects; observe the old behavior fail the new expectations.
- [x] Remove Remix workspace, providers, session UI, agent tools, schedules, connected apps/MCP, Brain, and agent notification producers; simplify mixed settings, models, billing copy, auth cache resets, and browser fixtures.
- [x] Simplify the recording pill to dictation/error/cancel behavior, preserving capture, streaming, pipeline delivery, output destination, and animations.
- [x] Remove obsolete agent tests/styles/locales/dependencies after checking remaining consumers.
- [x] Run renderer typecheck and desktop unit tests; record any integration failures for task 5.

### Task 2: Native Electron integration

**Files:** `apps/electron/src/main/**`, `apps/electron/src/preload/**`, `apps/electron/src/shared/**`, Electron native test resources as required.

**Interfaces:** Produces dictation-only IPC/types and overlay sizing; no Remix hotkey, file tools, editing IPC, or notification-to-agent routing. Does not remove shared paste/native primitives needed for dictation.

- [x] Update overlay and hotkey lifecycle tests for dictation-only contracts; verify relevant old behavior fails.
- [x] Remove agent file grants, Remix context/editing IPC, hotkey registration/watchdogs, route-key/focus special cases, agent window expansion, and companion agent notification flows.
- [x] Preserve dictation output, onboarding practice insertion, native cancellation and focus restoration; simplify preload API declarations and browser contract requirements.
- [x] Run native TypeScript checks and affected unit tests; report remaining renderer integration errors.

### Task 3: Mobile and keyboard

**Files:** `apps/mobile/**` including source Swift extension/shared-store module, mobile dependencies.

**Interfaces:** Uses existing cloud transcription/cleanup and auth APIs. Produces dictation-only home and keyboard, with safe old agent-link destinations and no `/v2/remix` transport.

- [x] Update mobile home/startup/keyboard compatibility tests for dictation-only behavior and old stored Remix mode.
- [x] Remove Remix home/chat, session sidebar, thread clients, automations, connected apps, agent approvals/notifications and settings; retain settings/history routes.
- [x] Remove Remix mode and agent turns from native keyboard and resident bridge while retaining recording, background sessions, cancellation, insertion tokens/acks, and recovery.
- [x] Remove unused mobile dependencies/config and update onboarding/help/profile copy.
- [x] Run mobile unit tests and TypeScript checks.

### Task 4: Server, shared contracts, and product docs

**Files:** `apps/server/**`, `packages/validations/**`, `apps/docs/**`, `README.md`, root lockfile.

**Interfaces:** Retains voice/llm models, `/api/output`, transcription/stream/cleanup, auth/billing/history/settings/plugin APIs. Agent/MCP/Brain/connector/scheduled routes are absent; persisted legacy rows remain readable.

- [x] Add a real HTTP route test proving removed agent endpoints return 404 while dictation health/output remain mounted; watch it fail first.
- [x] Remove agent routes, queues, stores, memory/MCP/local-tool startup imports and hooks; retain migration SQL/data and remove active agent retention mutations.
- [x] Remove agent-only shared schemas and model role support while making existing `remix` model rows harmless to dictation.
- [x] Remove Remix/MCP docs and links and update product descriptions; preserve historical engineering docs.
- [x] Prune unused dependencies and regenerate lockfile after other task manifests settle.
- [x] Run server/validation suites and server build.

### Task 5: Integration, review, and PR

**Files:** Cross-cutting fixes to the above; no unrelated research changes.

- [x] Run all affected package tests/typechecks and desktop/browser builds; resolve failures caused by removed contracts.
- [x] Run browser navigation/onboarding coverage where the environment supports it.
- [x] Scan active source and imports for remaining agent mounts, native registrations, cloud transports, UI copy and stale routes.
- [x] Obtain independent whole-branch review and fix material findings.
- [ ] Commit the reviewed changes, push `codex/remove-remix-agent`, and open a PR against `main` with validation and physical-device limitations.
