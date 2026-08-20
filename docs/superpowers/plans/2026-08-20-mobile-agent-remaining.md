# Mobile Agent Remaining Work Plan

**Goal:** Finish the mobile agent experience after the delivered five-tab shell, durable `/v2/agent` transport, and streamed Home composer.

**Completed:** Native Home/Activity/Keyboard/Words/Profile navigation; Dictate mode; durable agent transport; streamed Home conversation and stop/new-thread controls.

## 1. Durable conversations and Activity

**Files:** `apps/mobile/src/lib/remix/client.ts`, `apps/mobile/src/lib/remix/activity.ts`, `apps/mobile/src/lib/remix/activity.test.ts`, `apps/mobile/src/app/(app)/history.tsx`, `apps/mobile/src/app/(app)/(tabs)/activity.tsx`.

- [ ] Test `getLatestThread`, `getThread`, and `listThreads` against `/v2/threads`; test that scheduled origins render as Briefs and local dictations remain distinct.
- [ ] Add Cloud-thread hydration to `useRemixThread`, including a thread ID route parameter so Activity can reopen a conversation in Home.
- [ ] Merge paginated user conversations, scheduled briefs, Cloud notifications, and the existing local dictation history by timestamp. Keep source labels, search, copy, and delete behavior explicit.
- [ ] Validate test, lint, typecheck, and an iPhone flow: open a historic conversation, a brief, and a dictation entry.

## 2. Connected apps, MCPs, and agent approvals

**Files:** `apps/mobile/src/lib/remix/connectors.ts`, `apps/mobile/src/lib/remix/tool-policy.ts`, their tests, `apps/mobile/src/app/(app)/connected-apps.tsx`, `apps/mobile/src/app/(app)/profile.tsx`, `apps/mobile/src/components/remix/connector-*.tsx`.

- [ ] Test tool classification: read-only connector calls display progress; connector writes require approval; all desktop/OS tools are unsupported on mobile.
- [ ] Implement catalog, detail, connect, reconnect, disconnect, and API-key connector calls via `/v2/connectors`; OAuth returns through Expo’s browser/deep-link flow.
- [ ] Add Profile → Connected apps and display agent write requests as Allow/Don’t allow cards in Home. Only an explicit Allow receives an approval token and calls execute.
- [ ] Validate that no connector write can run from the keyboard extension.

## 3. Scheduled work and notifications

**Files:** `apps/mobile/src/lib/remix/scheduled.ts`, `apps/mobile/src/lib/remix/notifications.ts`, tests, `apps/mobile/src/app/(app)/scheduled.tsx`, `apps/mobile/src/app/(app)/notifications.tsx`, Profile and stack routes.

- [ ] Mirror Cloud scheduled-task CRUD and notification read/dismiss APIs with typed clients and failing-first tests.
- [ ] Add Profile management pages for schedules and notifications; use native confirmation before destructive deletion.
- [ ] Ensure scheduled runs remain readable as Activity briefs after their schedule is deleted.
- [ ] Validate offline, auth-expired, usage-limited, and reconnect-required states with deterministic recovery copy.

## 4. Voice-only keyboard agent

**Files:** `apps/mobile/src/lib/keyboard/remix-bridge.ts`, `apps/mobile/src/lib/keyboard/keyboard-remix-provider.tsx`, tests, both `DictationBridge.swift` copies, `KeyboardViewController.swift`, and `apps/mobile/src/app/(app)/_layout.tsx`.

- [ ] Test the separate Remix App Group command/state protocol: start, commit, answer, cancel, acknowledge insert; test auto-listen enabled/disabled and exactly-one insertion.
- [ ] Implement the app-side resident recorder and `/v2/agent` coordinator. It publishes only listening, working, one question, ready, or failed state.
- [ ] Extend the keyboard with a compact Dictate/Remix switch and status strip; preserve the current dictation keys and protocol unchanged.
- [ ] Verify both Swift bridge files are byte-identical; validate one successful paste, cancellation, failure, and a blocked connected-app write on a physical iPhone.

## 5. Release gate

- [ ] Run `pnpm --filter @freestyle-voice/mobile test`, `lint`, and `typecheck` after every slice.
- [ ] Perform device accessibility checks for VoiceOver, Dynamic Type, 44-point action targets, dark mode, and interrupted streaming.
- [ ] Review the complete PR against `specs/mobile-remix-redesign.md`, update the spec for only verified contract changes, then request review.

## Explicit non-goals

Brain/files, shell, screen/window/selection/clipboard reading, desktop hotkeys and overlay, and a typed or long-form in-keyboard chat remain desktop-only.
