# Mobile Remix Delivery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the mobile Remix experience to parity with the desktop agent where that capability is useful and safe on a phone: conversations, streamed runs, connected apps, scheduled outcomes, and a compact voice-only iOS keyboard agent.

**Architecture:** Keep mobile as a thin authenticated client of the durable Cloud agent contracts: `/v2/agent`, `/v2/threads`, `/v2/connectors`, `/v2/scheduled`, and `/v2/notifications`. Model the agent UI as a small Remix domain layer, separate from the existing dictation recorder. The app hosts full conversations and any approval cards; the keyboard hosts only spoken input, one clarification, compact progress, and one final `insert_at_cursor` result.

**Tech Stack:** Expo Router NativeTabs, React Native, TypeScript, TanStack Query, Better Auth Expo session cookies, Vercel AI SDK UI-message streams, Swift/UIKit, App Group `UserDefaults`, Vitest.

**Spec:** `specs/mobile-remix-redesign.md`

## Global constraints

- Keep the delivered five-tab shell: Home, Activity, Keyboard, Words, and Profile.
- Home defaults to Remix; Dictate remains an independent Home mode and retains its current audio-session safety behavior.
- Use the existing `cloud.request()` raw-response method for streams and `cloud.json()` for JSON APIs; do not create a mobile-only Cloud endpoint.
- Never expose Brain, local files, shell access, screen/window capture, selection reading, or clipboard reading to mobile.
- Treat connected-app writes as explicit approval flows in the app. The keyboard cannot start, approve, or execute them.
- The keyboard accepts voice only in Remix mode. It contains no text composer, thread history, tool-detail view, or transcript card.
- `Listen after Remix questions` defaults to `true` and never restarts listening after final paste, cancel, failure, or a connected-app action.
- A keyboard turn may insert exactly one nonblank result, capped by `REMIX_WRITE_LIMIT`, and must acknowledge that insertion before resetting.
- Preserve the current dictation App Group command/state protocol without behavior changes. The two Swift bridge copies stay byte-for-byte identical.

---

## Delivery map

| Milestone | User-visible outcome | Depends on |
| --- | --- | --- |
| 1. Remix transport | Mobile can load threads and decode a Cloud run safely. | Existing auth + Cloud APIs |
| 2. Home conversations | Users can ask, stream, stop, retry, and continue Remix conversations. | 1 |
| 3. Activity | Conversations, dictations, scheduled briefs, and notifications appear together. | 1, 2 |
| 4. Connected apps | Users can manage MCP/connected apps and approve writes in the app. | 1, 2 |
| 5. Keyboard Remix | Voice-only agent flow can ask one follow-up and paste exactly once. | 1, 2, 4 |
| 6. Release validation | iOS behavior, errors, accessibility, and rollback conditions are verified. | 1–5 |

## File structure

| Path | Responsibility |
| --- | --- |
| `apps/mobile/src/lib/remix/types.ts` | Domain types for threads, stream events, tools, approvals, and keyboard turns. |
| `apps/mobile/src/lib/remix/client.ts` | Typed Cloud requests and AI SDK stream decoding. |
| `apps/mobile/src/lib/remix/query.ts` | TanStack query keys/options for threads, scheduled outcomes, notifications, and connectors. |
| `apps/mobile/src/lib/remix/use-remix-thread.ts` | Active-thread lifecycle, send/stop/retry, and persisted messages. |
| `apps/mobile/src/lib/remix/tool-policy.ts` | Mobile-safe tool classification and approval state transitions. |
| `apps/mobile/src/lib/remix/connectors.ts` | Connected-app catalog, connection, approval, and execution requests. |
| `apps/mobile/src/components/remix/*` | Focused composer, turn list, tool status, approval card, and activity components. |
| `apps/mobile/src/app/(app)/(tabs)/index.tsx` | Home mode control plus the Remix conversation surface. |
| `apps/mobile/src/app/(app)/history.tsx` | Activity feed with dictations, threads, briefs, and notifications. |
| `apps/mobile/src/app/(app)/connected-apps.tsx` | Connected-app discovery, connection detail, and management screen. |
| `apps/mobile/src/lib/keyboard/remix-bridge.ts` | TypeScript protocol facade for the App Group Remix namespace. |
| `apps/mobile/src/lib/keyboard/keyboard-remix-provider.tsx` | Recorder + Remix streaming coordinator for keyboard turns. |
| `apps/mobile/ios-keyboard/DictationBridge.swift` | Native command/state codec; mirrored exactly below. |
| `apps/mobile/modules/freestyle-shared-store/ios/DictationBridge.swift` | Byte-identical native bridge copy. |
| `apps/mobile/ios-keyboard/KeyboardViewController.swift` | Compact Dictate/Remix keyboard control and rendering. |

## Task 1: Build the mobile Remix transport and state boundary

**Files:**

- Modify: `apps/mobile/src/lib/remix/types.ts`
- Modify: `apps/mobile/src/lib/remix/reducer.ts`
- Create: `apps/mobile/src/lib/remix/client.ts`
- Create: `apps/mobile/src/lib/remix/client.test.ts`
- Create: `apps/mobile/src/lib/remix/query.ts`
- Create: `apps/mobile/src/lib/remix/query.test.ts`
- Modify: `apps/mobile/src/lib/remix/request.ts`

**Interfaces:**

- Produces `listThreads(input)`, `getThread(id)`, `getLatestThread()`, and `runRemixTurn(input, handlers)`.
- `runRemixTurn` accepts `{ messages: UIMessage[]; threadId: string; firstTurn?: boolean; signal: AbortSignal }` and emits `text`, `tool`, `tool-result-needed`, `error`, and `complete` events.
- The reducer owns `idle | submitting | streaming | awaiting-approval | failed | complete`; UI components consume normalized events only.

- [ ] **Step 1: Write failing transport tests.**

  Cover the raw Cloud request and stream contract using a mocked `cloud.request()`:

  ```ts
  it("posts the full UI-message thread to its durable agent thread", async () => {
    await runRemixTurn({ messages, threadId, signal: new AbortController().signal }, handlers);
    expect(cloud.request).toHaveBeenCalledWith(
      "/v2/agent",
      expect.objectContaining({ method: "POST", json: { messages, threadId } }),
    );
  });

  it("turns a streamed insert_at_cursor call into a pending client-tool event", async () => {
    await streamFixture("insert-at-cursor");
    expect(events).toContainEqual({ type: "tool-result-needed", name: "insert_at_cursor" });
  });
  ```

- [ ] **Step 2: Run the focused tests before implementation.**

  Run: `pnpm --filter @freestyle-voice/mobile test -- client.test.ts query.test.ts`

  Expected: FAIL because the mobile Remix client and query layer do not exist.

- [ ] **Step 3: Implement the typed adapter.**

  Use `cloud.request("/v2/agent", { method: "POST", json, signal })` so the existing cookie handling and status taxonomy are preserved. Send the full UI-message thread with a stable `threadId` and `firstTurn` for new conversations. Use AI SDK UI-message stream utilities rather than splitting SSE text. Map `401`, `429`, aborted requests, and malformed streams to stable mobile error codes.

  Query `/v2/threads` with `origin: "user" | "scheduled"`; cache summaries, individual thread messages, and the latest user thread separately. Do not store full assistant messages in AsyncStorage—the Cloud thread is the source of truth.

- [ ] **Step 4: Verify the domain boundary.**

  Run: `pnpm --filter @freestyle-voice/mobile test -- client.test.ts query.test.ts reducer.test.ts && pnpm --filter @freestyle-voice/mobile typecheck`

  Expected: PASS; a cancelled `AbortSignal` ends only the active stream and does not discard the local draft.

- [ ] **Step 5: Commit the transport boundary.**

  ```bash
  git add apps/mobile/src/lib/remix
  git commit -m "feat(mobile): Add Remix cloud transport"
  ```

## Task 2: Replace the Remix Home placeholder with a complete conversation flow

**Files:**

- Create: `apps/mobile/src/lib/remix/use-remix-thread.ts`
- Create: `apps/mobile/src/lib/remix/use-remix-thread.test.ts`
- Create: `apps/mobile/src/components/remix/remix-composer.tsx`
- Create: `apps/mobile/src/components/remix/remix-turn-list.tsx`
- Create: `apps/mobile/src/components/remix/remix-tool-status.tsx`
- Create: `apps/mobile/src/components/remix/remix-error-card.tsx`
- Modify: `apps/mobile/src/app/(app)/(tabs)/index.tsx`

**Interfaces:**

- `useRemixThread()` returns `{ messages, draft, setDraft, send, stop, retry, status, activeTool, error }`.
- `RemixComposer` accepts `draft`, `onDraftChange`, `onSend`, `onStop`, and `disabled`.
- Dictation mode continues using `useDictation`; Remix voice input uses the same recorder only after a dedicated `onFinal` hand-off to the draft, never concurrently.

- [ ] **Step 1: Write failing hook and presentation tests.**

  ```ts
  it("keeps a failed prompt in the draft for retry", async () => {
    const { result } = renderHook(() => useRemixThread());
    act(() => result.current.setDraft("Draft a reply"));
    await act(() => result.current.send());
    expect(result.current.draft).toBe("Draft a reply");
    expect(result.current.status).toBe("failed");
  });

  it("changes the composer action from send to stop while streaming", () => {
    expect(composerAction("streaming")).toBe("stop");
  });
  ```

- [ ] **Step 2: Run the tests to establish the missing behavior.**

  Run: `pnpm --filter @freestyle-voice/mobile test -- use-remix-thread.test.ts remix-composer.test.ts`

  Expected: FAIL because the hook and conversation components are absent.

- [ ] **Step 3: Implement the Home interaction.**

  Replace `RemixHome()` in `index.tsx` with a scrollable turn list and a sticky composer. Start on the latest user thread; expose New conversation in the existing header actions. Permit typed prompts and an explicit mic action that places the completed transcription into the Remix draft. While a run streams, show a single concise tool-status row and turn Send into Stop. Assistant turns allow Copy and Regenerate; user turns allow Edit and Resend. Keep the three starter prompts as draft-fill shortcuts, not immediate requests.

  If `insert_at_cursor` appears in an in-app run, show the generated text with Copy/Share and answer the client tool with `{ ok: false, reason: "mobile-app-insert-unavailable" }`; only the keyboard can execute insertion.

- [ ] **Step 4: Validate Home behavior.**

  Run: `pnpm --filter @freestyle-voice/mobile test -- use-remix-thread.test.ts remix-composer.test.ts && pnpm --filter @freestyle-voice/mobile lint && pnpm --filter @freestyle-voice/mobile typecheck`

  Expected: PASS; switching to Dictate cannot start a second microphone session and returning to Remix retains its draft.

- [ ] **Step 5: Commit the complete Home flow.**

  ```bash
  git add apps/mobile/src/app/'(app)'/'(tabs)'/index.tsx apps/mobile/src/components/remix apps/mobile/src/lib/remix
  git commit -m "feat(mobile): Add streaming Remix conversations"
  ```

## Task 3: Make Activity the durable record of mobile work

**Files:**

- Create: `apps/mobile/src/lib/remix/activity.ts`
- Create: `apps/mobile/src/lib/remix/activity.test.ts`
- Create: `apps/mobile/src/components/remix/activity-filter.tsx`
- Create: `apps/mobile/src/components/remix/activity-list.tsx`
- Modify: `apps/mobile/src/app/(app)/history.tsx`
- Modify: `apps/mobile/src/app/(app)/(tabs)/activity.tsx`

**Interfaces:**

- `loadActivityPage({ cursor, filter })` returns a display union of `dictation`, `conversation`, `brief`, and `notification` entries.
- Filters are `all | conversations | briefs | dictation`; notifications link to their referenced thread when present.
- A click on a conversation or brief opens it in Home; a dictation still copies from the Activity surface.

- [ ] **Step 1: Write failing normalization tests.**

  ```ts
  it("keeps a scheduled thread distinct from a user conversation", () => {
    expect(toActivityItem(scheduledThread).kind).toBe("brief");
  });

  it("sorts local dictation and cloud activity by newest timestamp", () => {
    expect(mergeActivity([dictation], [conversation])[0].id).toBe(conversation.id);
  });
  ```

- [ ] **Step 2: Run the focused Activity tests.**

  Run: `pnpm --filter @freestyle-voice/mobile test -- activity.test.ts`

  Expected: FAIL because no unified activity model exists.

- [ ] **Step 3: Implement paged cloud + local activity.**

  Read user and scheduled summaries from `/v2/threads`, notification rows from `/v2/notifications/history`, and retain the existing local `HistoryProvider` as the dictation source. Keep source labels explicit: “Conversation”, “Brief”, and “Dictation.” Do not copy Cloud content into local history. Use cursor pagination for Cloud items; local dictations remain searchable with the existing search implementation.

- [ ] **Step 4: Verify navigation and pagination.**

  Run: `pnpm --filter @freestyle-voice/mobile test -- activity.test.ts && pnpm --filter @freestyle-voice/mobile lint && pnpm --filter @freestyle-voice/mobile typecheck`

  Expected: PASS; scheduled briefs open read-only in Home and a missing notification target shows a recoverable “No longer available” state.

- [ ] **Step 5: Commit the unified Activity surface.**

  ```bash
  git add apps/mobile/src/app/'(app)' apps/mobile/src/components/remix apps/mobile/src/lib/remix
  git commit -m "feat(mobile): Unify Remix and dictation activity"
  ```

## Task 4: Add connected-app/MCP discovery, lifecycle, and approval cards

**Files:**

- Create: `apps/mobile/src/lib/remix/connectors.ts`
- Create: `apps/mobile/src/lib/remix/connectors.test.ts`
- Create: `apps/mobile/src/lib/remix/tool-policy.ts`
- Create: `apps/mobile/src/lib/remix/tool-policy.test.ts`
- Create: `apps/mobile/src/components/remix/connector-card.tsx`
- Create: `apps/mobile/src/components/remix/connector-approval-card.tsx`
- Create: `apps/mobile/src/app/(app)/connected-apps.tsx`
- Modify: `apps/mobile/src/app/(app)/profile.tsx`
- Modify: `apps/mobile/src/app/(app)/_layout.tsx`

**Interfaces:**

- Connector functions mirror the Cloud routes: catalog, detail, connect, status, disconnect, approve, and execute.
- `classifyMobileTool(name)` returns `server-read-only | connected-read-only | connected-write | client-insert | unsupported`.
- Connected writes pause a Home turn on an approval card and resume only with the corresponding tool result.

- [ ] **Step 1: Write failing connector and policy tests.**

  ```ts
  expect(classifyMobileTool("connector__gmail__ro_search_mail")).toBe("connected-read-only");
  expect(classifyMobileTool("connector__gmail__send_email")).toBe("connected-write");
  expect(classifyMobileTool("Read")).toBe("unsupported");

  await disconnectConnector("gmail");
  expect(cloud.json).toHaveBeenCalledWith("/v2/connectors/gmail/disconnect", { method: "POST" });
  ```

- [ ] **Step 2: Run the focused connector tests.**

  Run: `pnpm --filter @freestyle-voice/mobile test -- connectors.test.ts tool-policy.test.ts`

  Expected: FAIL because mobile has no connector client or policy.

- [ ] **Step 3: Implement Profile → Connected apps.**

  Add a Profile navigation row and a pushed Connected apps screen. Use the Cloud catalog, connection, details, connect, status, and disconnect endpoints. OAuth opens the authorized URL with `expo-web-browser`; when the app resumes, poll the connection status and invalidate connector queries. API-key connectors use an in-app secure form and are never written to logs or AsyncStorage.

  Render read-only connector progress in the conversation. For any mutating connector tool, show the action name, connected account, and Allow/Don’t allow controls. On Allow, obtain the Cloud approval token then execute it; on decline, send a declined tool result. Never render these controls in the keyboard extension.

- [ ] **Step 4: Verify connector safety.**

  Run: `pnpm --filter @freestyle-voice/mobile test -- connectors.test.ts tool-policy.test.ts && pnpm --filter @freestyle-voice/mobile lint && pnpm --filter @freestyle-voice/mobile typecheck`

  Expected: PASS; a reconnect-required status is actionable, and every mutating tool requires an explicit tap.

- [ ] **Step 5: Commit connected-app support.**

  ```bash
  git add apps/mobile/src/app/'(app)' apps/mobile/src/components/remix apps/mobile/src/lib/remix
  git commit -m "feat(mobile): Add connected app controls"
  ```

## Task 5: Bring scheduled tasks and notifications to mobile deliberately

**Files:**

- Create: `apps/mobile/src/lib/remix/scheduled.ts`
- Create: `apps/mobile/src/lib/remix/scheduled.test.ts`
- Create: `apps/mobile/src/lib/remix/notifications.ts`
- Create: `apps/mobile/src/lib/remix/notifications.test.ts`
- Create: `apps/mobile/src/app/(app)/scheduled.tsx`
- Modify: `apps/mobile/src/app/(app)/profile.tsx`
- Modify: `apps/mobile/src/app/(app)/_layout.tsx`

**Interfaces:**

- `listScheduledTasks()`, `createScheduledTask(input)`, `updateScheduledTask(id, input)`, and `deleteScheduledTask(id)` mirror the existing `/v2/scheduled` contract.
- `listNotifications()`, `markNotificationRead(id)`, and `dismissNotification(id)` mirror `/v2/notifications`.
- Scheduled runs continue to surface as `brief` items in Activity; task management belongs in Profile.

- [ ] **Step 1: Write failing task and notification client tests.**

  ```ts
  await createScheduledTask({ name: "Morning brief", schedule: "0 9 * * 1-5", prompt: "Summarize priorities" });
  expect(cloud.json).toHaveBeenCalledWith("/v2/scheduled", expect.objectContaining({ method: "POST" }));

  expect(notificationAction({ openedAt: null, dismissedAt: null })).toBe("mark-read");
  ```

- [ ] **Step 2: Run the focused scheduled-work tests.**

  Run: `pnpm --filter @freestyle-voice/mobile test -- scheduled.test.ts notifications.test.ts`

  Expected: FAIL because neither mobile client exists.

- [ ] **Step 3: Implement management with narrow mobile scope.**

  Add Profile rows for Scheduled tasks and Notifications. The scheduled screen lists, enables/disables, creates, edits, and deletes tasks using the Cloud validation rules; it does not create a second local scheduler. The notifications screen supports quiet-hours preference only if the endpoint returns it, then Read/Dismiss and deep-link-to-thread actions. A scheduled brief always remains readable from Activity even if its schedule was later removed.

- [ ] **Step 4: Verify task management and links.**

  Run: `pnpm --filter @freestyle-voice/mobile test -- scheduled.test.ts notifications.test.ts && pnpm --filter @freestyle-voice/mobile typecheck`

  Expected: PASS; a task deletion needs a native destructive confirmation and cannot remove its historical briefs.

- [ ] **Step 5: Commit scheduled-work parity.**

  ```bash
  git add apps/mobile/src/app/'(app)' apps/mobile/src/lib/remix
  git commit -m "feat(mobile): Add scheduled work controls"
  ```

## Task 6: Extend the iOS keyboard bridge with voice-only Remix

**Files:**

- Create: `apps/mobile/src/lib/keyboard/remix-bridge.ts`
- Create: `apps/mobile/src/lib/keyboard/remix-bridge.test.ts`
- Create: `apps/mobile/src/lib/keyboard/keyboard-remix-provider.tsx`
- Create: `apps/mobile/src/lib/keyboard/keyboard-remix-provider.test.tsx`
- Modify: `apps/mobile/src/lib/keyboard/dictation-bridge.ts`
- Modify: `apps/mobile/src/lib/keyboard/keyboard-dictation-provider.tsx`
- Modify: `apps/mobile/src/app/(app)/_layout.tsx`
- Modify: `apps/mobile/ios-keyboard/DictationBridge.swift`
- Modify: `apps/mobile/modules/freestyle-shared-store/ios/DictationBridge.swift`
- Modify: `apps/mobile/ios-keyboard/KeyboardViewController.swift`

**Interfaces:**

- Namespaced commands: `startRemix`, `commitRemix`, `answerRemix`, `cancelRemix`, and `ackInsert`.
- Namespaced states: `idle`, `remixListening`, `remixWorking`, `remixQuestion`, `remixReady`, and `remixFailed`.
- `useKeyboardRemixBridge({ signedIn, autoListenAfterQuestion })` owns recording, stream progression, and exactly-once insertion acknowledgement.

- [ ] **Step 1: Write failing protocol tests.**

  ```ts
  it("automatically records exactly one answer for a direct question when enabled", () => {
    expect(nextRemixKeyboardState(questionEvent, true).phase).toBe("remixListening");
  });

  it("rejects a second final insertion in one keyboard turn", () => {
    const inserted = acknowledgeInsert(readyState("Hello"));
    expect(canInsertKeyboardFinal(inserted)).toBe(false);
  });
  ```

- [ ] **Step 2: Run the protocol tests.**

  Run: `pnpm --filter @freestyle-voice/mobile test -- remix-bridge.test.ts keyboard-remix-provider.test.tsx`

  Expected: FAIL because the Remix keyboard namespace and provider are absent.

- [ ] **Step 3: Implement the separate App Group protocol.**

  Add separate UserDefaults keys and Darwin notifications for Remix; do not overload any dictation key. The React Native provider wakes the resident app session, records a spoken instruction, calls `runRemixTurn`, publishes only short statuses/questions, and resolves `insert_at_cursor` only after `ackInsert`. Enforce the size limit and insertion token before publishing ready. Auto-listen only after a direct Remix question and only once; cancellation, failure, and connector tool calls return to idle without insertion.

- [ ] **Step 4: Implement the compact extension UI.**

  Add a Dictate/Remix mode switch and a single dynamic status strip above the existing key row. The strip may show one partial phrase, “Remix is writing”, one short question, “Pasted ✓”, or a recoverable failure. Preserve globe, punctuation, space, return, and delete. Do not add a text input, scrolling conversation, transcript history, or approval UI.

- [ ] **Step 5: Validate cross-language parity.**

  Run:

  ```bash
  diff -u apps/mobile/ios-keyboard/DictationBridge.swift apps/mobile/modules/freestyle-shared-store/ios/DictationBridge.swift
  pnpm --filter @freestyle-voice/mobile test -- remix-bridge.test.ts keyboard-remix-provider.test.tsx
  pnpm --filter @freestyle-voice/mobile typecheck
  ```

  Expected: no diff; tests and TypeScript pass.

- [ ] **Step 6: Commit the keyboard agent flow.**

  ```bash
  git add apps/mobile/src/lib/keyboard apps/mobile/src/app/'(app)'/_layout.tsx apps/mobile/ios-keyboard apps/mobile/modules/freestyle-shared-store
  git commit -m "feat(mobile): Add voice-only Remix keyboard"
  ```

## Task 7: Release hardening, accessibility, and operational verification

**Files:**

- Create: `apps/mobile/src/lib/remix/error-copy.test.ts`
- Modify: `apps/mobile/src/app/(app)/(tabs)/index.tsx`
- Modify: `apps/mobile/src/app/(app)/connected-apps.tsx`
- Modify: `apps/mobile/src/app/(app)/scheduled.tsx`
- Modify: `specs/mobile-remix-redesign.md` only for a verified contract correction.

**Interfaces:**

- Every remote action resolves to one of `cloud_auth_required`, `usage_limited`, `network_unavailable`, `tool_disconnected`, `cancelled`, or `unknown`.
- All icons have labels, all action targets are at least 44 × 44 points, and dynamic stream/keyboard status uses an accessible live region equivalent.

- [ ] **Step 1: Write failing error-copy and policy regression tests.**

  ```ts
  expect(remixErrorCopy({ code: "usage_limited" })).toContain("limit");
  expect(remixErrorCopy({ code: "tool_disconnected" })).toContain("Reconnect");
  expect(keyboardRecovery({ phase: "remixFailed" }).allowsInsertion).toBe(false);
  ```

- [ ] **Step 2: Run the focused regression tests.**

  Run: `pnpm --filter @freestyle-voice/mobile test -- error-copy.test.ts`

  Expected: FAIL until all error states have deterministic mobile copy.

- [ ] **Step 3: Implement the release safety pass.**

  Ensure interrupted streams leave the user’s draft intact, stop does not resend, expired connector credentials link to the appropriate detail screen, and 429 errors link to Profile usage. Review contrast and touch targets in Home, Activity, Connected apps, Scheduled tasks, and keyboard setup. Keep native keyboard statuses short enough to fit the existing 291-point extension height at Large Dynamic Type.

- [ ] **Step 4: Run the automated release gate.**

  Run:

  ```bash
  pnpm --filter @freestyle-voice/mobile test
  pnpm --filter @freestyle-voice/mobile lint
  pnpm --filter @freestyle-voice/mobile typecheck
  ```

  Expected: all commands pass.

- [ ] **Step 5: Complete the device checklist before release.**

  Verify on an iPhone simulator and physical device: signed-in Home stream; stop/retry; Dictate without recorder conflict; opening a historical conversation; a scheduled brief; OAuth return and reconnect; a read-only connector tool; a declined write; keyboard dictation insertion; keyboard Remix prompt; enabled and disabled follow-up listening; one final paste; failure/cancel with no paste; VoiceOver labels; light/dark mode; and offline/401/429 handling.

- [ ] **Step 6: Commit validation fixes separately.**

  ```bash
  git add apps/mobile specs/mobile-remix-redesign.md
  git commit -m "test(mobile): Validate Remix release flow"
  ```

## Scope explicitly kept desktop-only

- Brain, Notes, Todo, filesystem, shell, screen, window, clipboard, selection, and local document tools.
- Desktop global hotkeys, overlay/panel, companion sprite, local app lifecycle controls, and update controls.
- Any in-keyboard typing or long-form chat UI.

## Plan self-review

- **Spec coverage:** Tasks 1–2 cover Remix threads, streaming, failures, and Home. Task 3 covers history and completed briefs. Task 4 covers connected apps/MCPs and approvals. Task 5 closes scheduled-task/notification parity. Task 6 completes the voice-only keyboard and safe insertion. Task 7 covers error, accessibility, and device verification.
- **Intentional divergence:** The last section records desktop powers that must not be ported, so “parity” does not broaden mobile permissions.
- **Dependencies:** Each milestone has a testable user-visible output and can be reviewed as its own PR after the transport foundation.
