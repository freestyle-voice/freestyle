# Freestyle Remix Onboarding — Product & Technical Spec

Spec for the new onboarding flow, grounded in the codebase as of branch
`remix-prototype-onboarding` (identical to `remix-prototype` + this file).
Companion to `specs/remix.md` — but note that doc predates the shipped code;
where they disagree (tool names, flags), **trust the code**, which this spec
cites directly.

## Background (the brief)

Freestyle Remix — the AI writing agent on the cursor — shipped on
`remix-prototype`. Onboarding today guides the user through permissions and a
first dictation, but the dictation practice is bland (a bare textarea) and
Remix is never introduced. We want:

1. The transcription practice restyled as **dictating into a Gmail email
   draft** — a real message to a real-feeling person.
2. A continuation step where the user **edits that same draft with Freestyle
   Remix**, so the two features are learned as one story: *speak the email,
   then remix it.*

---

# Part 1 — Product spec

## 1.1 The story

Onboarding currently ends with "dictate into this box." The new flow ends
with a narrative the user will actually repeat tomorrow: you owe Sam an
email, you say it out loud, it lands in the draft, you're not happy with the
tone, you hold the Remix key and say how to fix it, and the draft rewrites
itself in place. Two features, one scenario, one payoff — you press **Send**.

The Gmail draft is a *stage prop*: a faithful compose-window mockup rendered
inside our onboarding page. Nothing is sent anywhere; no Gmail account is
involved. Its job is recognition — "this is what dictating into my real email
will feel like" — which the current abstract textarea never delivers.

## 1.2 Flow

Steps today (`onboarding.tsx:79`): `cloud → permissions → language →
tutorial`. New flow:

```
cloud → permissions → language → draft (dictate) → remix (edit) → done
```

- **`draft`** replaces `tutorial`. Same responsibilities (model setup panel,
  hotkey rebind, first dictation) — new Gmail-draft stage instead of the
  bare practice textarea.
- **`remix`** is new. The *same* draft component carries over with the text
  the user just dictated; only the coaching changes. Back returns to `draft`
  without clearing the body.
- `finishSetup()` moves from the tutorial step to the remix step.

## 1.3 The `draft` step — dictate into Gmail

**Scene.** A Gmail compose card floats centered on the warm-paper canvas:
"New Message" header bar, **To:** prefilled with a fictional recipient
(`Sam Rivera <sam.rivera@example.com>`, shown as a Gmail-style recipient
chip), **Subject:** prefilled `Happy birthday`, an empty body, and the Gmail
footer row (blue Send button + decorative formatting icons). Only the body
is interactive; To/Subject are display-only. Send is disabled at this stage.

The scenario is a birthday note — chosen over more utilitarian drafts
("running late") because it stays coherent through every beat that follows:
a tone rewrite, a searched fact, and a pasted image all belong in a
birthday email.

**Coaching.** Below the card, a coach strip in our own design language:

- The keycap sentence from today's tutorial ("Press **⌘'** , speak,
  release." — keycaps physically depress on the real hotkey, exactly as
  `tutorial-demo.tsx` does now), the status dot (`Ready` / `Listening…` /
  `Landed in the draft`), and the live waveform driven by real mic
  amplitude.
- One suggestion line so nobody has to invent content:
  *"Click into the email, hold the key, and wish Sam a happy birthday —
  say you'll bring cake on Friday."*
- The existing hotkey-rebind control and `ModelSetupPanel` (shown only when
  the chosen model isn't ready), unchanged from the current tutorial step.

**Mechanics.** Identical to today: the user holds the dictation hotkey, the
pill appears, and the transcript pastes into the focused field — which is
the draft body. No new transcription plumbing.

**Progress.** Continue is enabled once the draft body is non-empty (today
nothing verifies the dictation happened; now the body text is the proof).
A quiet "Skip" remains for users who can't or won't dictate.

## 1.4 The `remix` step — edit the draft with Remix

**Scene.** The same Gmail card, same draft text the user just dictated. The
coach strip swaps to Remix:

- Remix keycaps (default **Fn+Control** on macOS, **Ctrl+Alt+E** elsewhere —
  from the `remix_hotkey` setting), animated on the real key events.
- Suggestion: *"Hold the keys and say: make it warmer, and sign off with
  my name."* Plus a secondary line: *"You don't need to select anything —
  Remix reads the draft itself."*

**Mechanics.** This is the **real Remix pipeline**, end to end: real hotkey,
real pill chat card, real agent, real tool calls driving the draft via
select-all / clipboard / paste — exactly what it will do tomorrow in actual
Gmail. The only change is that the agent is permitted to treat the
onboarding window as a target document for the duration of this step
(Part 2 §2.2). The user watches their own words get rewritten in place —
the product's single best "aha" moment, on a surface we fully control.

**Progress.**

- Success = Remix delivered text into the draft (an explicit signal from the
  main process, §2.4 — not a guess). On success the status line flips to
  "Remixed." and **Send activates**.
- **Send** is the finish: clicking it plays a small "Sent ✓" state inside
  the mockup, then completes onboarding (`onboarding_completed`, navigate to
  `/today`). The narrative closes: you wrote and polished an email without
  typing.
- "Finish without sending" (quiet link) is always available and also
  completes onboarding — Remix must never be a wall.

**The optional third beat — search and an image (cloud only).** After the
first remix succeeds (Send is already active — this beat can only add, never
block), users whose LLM is Freestyle Cloud get one more suggestion chip:

> *"One more trick — hold the keys and say: add a fun fact about birthday
> cake, and a picture of one."*

That single spoken instruction exercises the agent's full range: it
searches the web for the fact (`web_search`), finds an image
(`image_search`), fetches it onto the clipboard (`set_clipboard_image`),
and pastes it into the draft — a fact and an inline cake photo appearing in
an email the user started by voice. A small "this one takes a few seconds"
caption sets the latency expectation; the coach strip shows the agent's
narration (the pill's minimized activity strip already does this).

Scope rules for the beat:

- **Cloud-gated.** `web_search`/`image_search` are server tools on the
  cloud Worker only — the BYOK local loop has none — so the chip renders
  only when the default LLM is Freestyle Cloud. BYOK users finish after
  beat one and lose nothing they could actually use.
- **Strictly optional.** Failure, slowness, or an odd result changes
  nothing: Send stays active, the chip quietly offers "try again or send
  it." No gating, no error wall.
- The success sparkle (and `onboarding_remix_extra_completed`) fires on the
  same delivered signal as beat one.

**Fallback — no LLM configured.** Remix needs an LLM (Freestyle Cloud
session or a BYOK model passing `isCleanupModelSupported`). Users who
skipped cloud sign-in and configured only a local voice model can't run the
agent. For them the step renders a **scripted preview**: the same draft
card, an automated animation of a remix pass (instruction appears, text
morphs), with the note *"Remix needs an assistant model — add one in
Settings when you're ready."* and Continue. Same treatment when
`remix_enabled` is off or the remix hotkey failed to register (Linux
edge cases). E2E runs (`window.api.isE2E`) always take this path.

## 1.5 Visual design

- **The Gmail mockup is deliberately Gmail-faithful**, and therefore exempt
  *inside its frame* from DESIGN.md's palette rules: white `#FFFFFF`
  surface, Google Sans/Roboto-ish stack (system fallbacks — do not ship a
  new font), Gmail blue `#0B57D0` Send pill, gray hairlines, the dark
  "New Message" header bar. It reads as a depiction of another app, like a
  screenshot — which is the point. It floats (rounded corners + the modal
  shadow; floating layers are the one place DESIGN.md allows shadows).
- **Everything outside the frame is ours**: cream canvas, serif title with
  one italic olive word (`Draft it with your <em>voice</em>.` /
  `Now <em>remix</em> it.`), mono eyebrows (`STEP 4 · FIRST DICTATION`,
  `STEP 5 · FREESTYLE REMIX`), DM Sans coaching copy, our keycaps, our
  waveform. Components from `components/ui/*` only.
- Motion: the draft→remix transition keeps the card fixed and crossfades
  the coach strip (quick, ~0.15s, per DESIGN.md §8). The remix rewrite
  itself needs no added animation — the real paste replacing the text *is*
  the animation.
- Microcopy follows DESIGN.md §9: plain, confident, second person, no
  exclamation marks.

## 1.6 Analytics

Existing funnel events unchanged. New (same `capture()` path):

| Event | When |
|---|---|
| `onboarding_draft_dictated` | first time the draft body becomes non-empty via dictation |
| `onboarding_remix_step_viewed` | remix step mounts (with `interactive: bool` property for the fallback split) |
| `onboarding_remix_tried` | first remix hotkey-down while the step is active |
| `onboarding_remix_completed` | practice-delivered signal received |
| `onboarding_remix_extra_shown` | search+image chip rendered (cloud users, after beat one) |
| `onboarding_remix_extra_tried` | remix hotkey-down while the chip is showing |
| `onboarding_remix_extra_completed` | delivered signal received during the third beat |
| `onboarding_remix_skipped` | finished without a successful remix |
| `onboarding_email_sent` | user clicked Send (vs. the quiet finish link) |

Funnel to watch: `remix_step_viewed → remix_tried → remix_completed`. If
`tried → completed` drops badly, the agent is failing on our own window and
§2.6's risks are real.

## 1.7 Out of scope (v1)

- Teaching selections, presets (Ctrl+1–3), the chat thread, or the Remix
  bar. Hold-and-speak is the whole lesson — once for the rewrite, once
  more (optionally) for search + image.
- Re-onboarding existing users (flow only shows when `onboardingComplete`
  is unset and no models are configured — `main/index.ts:1538-1541`).
- Localizing the *fictional email content* per-locale beyond normal i18n
  keys (recipient name stays "Sam Rivera" everywhere).

---

# Part 2 — Technical spec

## 2.1 Why the real pipeline works — the one gate to open

Two established facts make this feature cheap:

1. **Dictation already lands in our own window.** Delivery is clipboard +
   injected Cmd/Ctrl+V into whatever has OS focus (`main/paste.ts`,
   `deliverOutput` at `main/index.ts:1429-1468`). The current tutorial's
   textarea receives real pasted transcriptions with zero special-casing
   (`components/tutorial-demo.tsx:38-49`). The Gmail body inherits this
   for free.
2. **Remix is blocked from our windows by a name check, nothing else.**
   The 13 agent primitives are ordinary keystroke/clipboard/AX injections
   that work on any focused window. The only thing excluding Freestyle
   itself is `getFreestyleAppExclusions()` (`main/index.ts:1047-1053` —
   `{app.getName(), app.name, "Freestyle", "Electron"}`) consulted at
   exactly three sites:
   - `remix:get-context` — `main/index.ts:2888`
   - `remix:recapture` — `main/index.ts:3153-3155`
   - `focusAnchorForInjection()` — `main/index.ts:3441` (the guard every
     write primitive passes through)

   The hotkey-down capture (`captureRemixSelection`, `main/index.ts:3767`)
   sets the anchor with **no** exclusion check, so with the gate opened the
   anchor is simply our app and the `front.appName === anchor.appName`
   equality at `main/index.ts:3445` passes naturally.

So the approach is: a narrowly-scoped **practice-target mode** in the main
process that suspends the self-exclusion while (and only while) the
onboarding remix step is active. No fake agent, no parallel simulation —
the onboarding exercises the identical code path users get in real apps.

## 2.2 Main process — practice-target mode

`apps/electron/src/main/index.ts`:

```ts
let remixPracticeTarget = false;

ipcMain.on("remix:set-practice-target", (event, active: unknown) => {
  // Only the dashboard/settings window may flip this.
  if (event.sender !== settingsWindow?.webContents) return;
  remixPracticeTarget = active === true;
  hotkeyLog.info(`remix practice target: ${remixPracticeTarget}`);
});
```

Cleared defensively (renderer unmount is the primary off-switch, these are
backstops): in `onboarding:set-complete`, on `settingsWindow` `closed`, and
on settings-window navigation.

The three gates change from

```ts
if (!front.appName || ours.has(front.appName.trim().toLowerCase())) …
```

to a shared pure helper (new file `apps/electron/src/main/remix-target.ts`,
in the `permission-checks.ts` style so it unit-tests without Electron):

```ts
export function isRemixTargetAllowed(
  appName: string | null,
  exclusions: ReadonlySet<string>,
  practiceTarget: boolean,
): boolean {
  if (!appName) return false;
  return practiceTarget || !exclusions.has(appName.trim().toLowerCase());
}
```

In `focusAnchorForInjection()` the `activateAnchorApp()` branch
(`main/index.ts:3441-3444`) is additionally skipped when
`remixPracticeTarget` and the frontmost app is ours — we are already in the
target app; activating "Freestyle" via osascript is at best a no-op and at
worst raises the wrong window. The trailing equality check stays as-is and
passes (anchor and front are both our app name).

**New event — the success signal.** In the success paths of
`remix:paste-clipboard` (`main/index.ts:3006-3008`) and `remix:paste-text`
(`main/index.ts:3128-3130`):

```ts
if (remixPracticeTarget) {
  settingsWindow?.webContents.send("remix:practice-delivered");
}
```

**Forwarded key events.** `handleRemixHotkeyDown`/`...Up`
(`main/index.ts:3794`, `:3828`) additionally send `remix:down` / `remix:up`
to `settingsWindow` when `remixPracticeTarget` — this drives the remix
keycap animation and the `onboarding_remix_tried` event, mirroring how
`hotkey:down`/`up` are already broadcast to both windows
(`main/index.ts:3702-3721`).

**Remix bar suppression.** The bar (a bottom-of-screen hover sliver,
`main/index.ts:3506-3606`) is noise during onboarding. Gate its creation on
the already-computed startup onboarding decision (`isOnboardingActive()` is
awaited before window creation, `main/index.ts:852-859`) and create it on
`onboarding:set-complete` instead.

**Preload** (`src/preload/index.ts` + `index.d.ts`): `setRemixPracticeTarget
(active)`, `onRemixPracticeDelivered(cb)`, `onRemixDown(cb)`, `onRemixUp(cb)`.

## 2.3 Renderer — steps and components

### Step enum and state lift (`onboarding.tsx`)

```ts
type Step = "cloud" | "permissions" | "language" | "draft" | "remix";
```

`"tutorial"` becomes `"draft"`; `"remix"` is appended. Draft body state
lifts to `OnboardingPage` so it survives the step transition:

```ts
const [draftBody, setDraftBody] = useState("");
```

Navigation wiring follows the existing hardcoded-transitions pattern
(`onboarding.tsx:747-846`): `language → draft → remix → finishSetup()`,
Back from `remix` → `draft` (body preserved), Back from `draft` →
`language`. `canFinish` gating (undownloaded local model,
`onboarding.tsx:710`) applies to leaving `draft`, as it does today.

### `components/onboarding/email-draft.tsx` (new)

The Gmail compose mockup. Props:

```ts
interface EmailDraftProps {
  body: string;
  onBodyChange: (text: string) => void;
  stage: "dictate" | "remix" | "sent";
  sendEnabled: boolean;
  onSend: () => void;
}
```

- To/Subject rows are static markup (recipient chip, hairlines, Gmail
  styling — scoped inline styles/Tailwind arbitrary values inside this one
  component; the design-system exemption of §1.5 lives here and nowhere
  else).
- Body is a **contenteditable rich-text surface**, not a `<textarea>` —
  today's unbound textarea (`tutorial-demo.tsx:229-238`) could take the
  dictation paste, but a textarea silently drops an *image* paste, and the
  third beat ends with `set_clipboard_image` + `paste` landing an inline
  photo. Contenteditable is also what real Gmail compose is, so the prop
  gets more faithful, and every injection the flow relies on works on it
  natively: text paste, Cmd+A/Cmd+C read, image paste (Chromium inserts
  the clipboard image as an inline `<img>`), and undo.
- React-wise the body is uncontrolled (a ref'd `contentEditable` div —
  fighting React reconciliation over externally-mutated DOM is a known
  tarpit). `onInput` syncs `el.innerText` out to the lifted `draftBody`
  state, which is used for gating/detection only, never written back into
  the DOM except on step-mount hydration.
- The component re-focuses the body textarea when its window regains focus
  while `stage !== "sent"` — after the pill's chat card is dismissed or
  blurred mid-remix, focus must return to the draft so the agent's
  injected keystrokes land in it (same reason main blurs the pill before
  injecting, `main/index.ts:3434-3438`).
- `stage === "sent"` renders the Sent ✓ state.

### Coach strip — extract from `tutorial-demo.tsx`

`TutorialDemo` stays as-is for the Today page's scripted demo
(`pages/history.tsx:575`). The reusable internals — keycap row with
press-animation, status dot, the `Wave` amplitude waveform
(`tutorial-demo.tsx:325-418`) — extract into
`components/onboarding/coach-strip.tsx`, parameterized by which key events
drive it: dictation (`onHotkeyDown/Up` + `onAudioLevel`) for the draft
step, remix (`onRemixDown/Up` + `onAudioLevel` — the pill broadcasts
amplitude regardless of mode, `main/index.ts:2185-2188`) for the remix
step.

### `DraftStep` (replaces `TutorialStep`, `onboarding.tsx:1685-1788`)

`EmailDraft stage="dictate"` + coach strip + the existing hotkey-rebind
control and `ModelSetupPanel` verbatim. Continue enabled when
`draftBody.trim() !== ""`. First transition from empty→non-empty while the
step is active fires `onboarding_draft_dictated` (corroborated by the
existing `onTranscriptionDone` ping, `preload/index.ts:379-388`, to avoid
counting manual typing — typing is still allowed to proceed, just not
counted as a dictation).

### `RemixStep` (new)

```ts
useEffect(() => {
  if (!interactive) return;
  window.api.setRemixPracticeTarget(true);
  return () => window.api.setRemixPracticeTarget(false);
}, [interactive]);
```

- `interactive` = LLM available (§2.5) && `remix_enabled` !== off &&
  `!window.api.isE2E`.
- Listens for `remix:practice-delivered` → success state, Send activates,
  `onboarding_remix_completed` — and, when `searchCapable` (§2.5), the
  third-beat chip appears; a later delivered signal while the chip is
  active fires `onboarding_remix_extra_completed`. Belt-and-braces
  fallback: a body change
  arriving while a remix session is in flight (between `remix:down` and
  30s after `remix:up`) also counts — covers a hypothetical future
  delivery path that bypasses the two paste handlers.
- Non-interactive variant: scripted morph of the user's actual draft text
  (reuse the phase-loop pattern from `tutorial-demo.tsx:24-28`), note +
  Continue.
- `onSend`: `capture("onboarding_email_sent")` → brief sent state →
  `finishSetup()` (which already does `capture("onboarding_completed")` +
  `setOnboardingComplete()` + navigate, `onboarding.tsx:687-691`).

## 2.4 The remix run against our own window — expected agent behavior

At hotkey-down over the onboarding window: `captureRemixSelection` injects
Cmd+C into the focused draft textarea (same mechanism that already pastes
into it; with no selection the sentinel survives and selection is `null` —
`paste.ts:624-652`), anchor = our app. The user speaks; the pill's chat
opens minimized; the agent receives context `{appName: "Freestyle"/
"Electron", selection: null, …}`.

With no selection and (likely) no AX text, the agent follows its
canvas-editor recipes (`remix-prompts.ts:105-178`): `select_all` → `copy`
to read the draft, compose the rewrite, `set_clipboard` → `paste` over the
selection. Every one of those primitives is an injection into the focused
element — the body textarea — and all pass through the now-open
`focusAnchorForInjection` gate. `undo` (Cmd+Z) also works natively in a
textarea, so even the recovery recipe holds.

`select_all` scope is the focused *contenteditable*, not the page —
To/Subject are separate elements and are safe by construction.

The third beat adds no new plumbing: `web_search`/`image_search` execute on
the cloud Worker inside the proxied stream (`routes/remix/agent.ts:38-96`),
`set_clipboard_image` fetches through the existing `fetchRemixImage` caps
(http/https only, 15 MB, 15 s — `main/index.ts:3454-3484`), and the final
`paste` flows through `remix:paste-clipboard` — the same handler that
already emits `remix:practice-delivered`, so image delivery reuses the
beat-one success signal verbatim.

## 2.5 LLM availability check (renderer)

The agent route requires `getDefaultModels().llm` server-side
(`routes/remix/agent.ts:99-107`). Onboarding already fetches configured
models to build `VoiceItem`s (`lib/models.ts` `buildVoiceItems`); the remix
step derives two booleans from the same query:

- `interactive` — an LLM-role default exists (Freestyle Cloud counts — the
  cloud sign-in step configured it via `applyFreestyleCloudDefaults`).
- `searchCapable` — that default's provider is Freestyle Cloud
  (`FREESTYLE_CLOUD_PROVIDER_ID`). Gates the third-beat chip: server tools
  exist only behind the cloud proxy; the BYOK loop
  (`lib/remix-agent.ts:31-44`) declares client tools only.

No new endpoint; worst case one existing `GET /api/models/configured`
refetch on step mount.

## 2.6 Risks and mitigations

| Risk | Mitigation |
|---|---|
| Chromium's lazy AX tree: `macos-ax` `read`/`select`/`caps` may see no text in our window (Electron enables AX only when an assistive tech asks) | Not load-bearing — the guided task works entirely on the canvas-editor path (§2.4). Stretch: call `app.setAccessibilitySupportEnabled(true)` while practice mode is on to light up precise selection; verify in manual QA before adopting. |
| Focus lands in the pill chat input instead of the draft when the agent injects | Already handled for external apps (pill blur + 140 ms, `main/index.ts:3434-3438`); the draft re-focus behavior in `EmailDraft` (§2.3) covers our side. Manual-matrix item. |
| `activateAnchorApp("Freestyle")` raising the wrong window | Branch skipped in practice mode (§2.2). |
| User drags the onboarding window away / minimizes mid-run | Same anchor-lost semantics as production: paste fails → agent reports honestly in chat. Not worth special-casing. |
| Practice mode leaks past onboarding | Renderer unmount clears it; `onboarding:set-complete`, window `closed`, and navigation are backstops (§2.2). Unit-test the helper, assert cleared in E2E teardown. |
| Free-cloud user hits usage 429 during practice | Existing pill upgrade-prompt surface handles it (`cloudPromptUpgrade`); coach strip stays on "try again or skip". |
| Dictation hotkey pressed during remix step | Fine — dictation into the draft is harmless; Remix's supersede logic (`main/index.ts:3811-3815`) already arbitrates the chord race. |
| Third beat is slow or flaky (multi-step loop + two searches + image fetch over the network) | Structurally non-blocking: chip appears only after Send is already active, caption sets the expectation, failure surfaces as the agent's own honest chat narration. Watch the `extra_tried → extra_completed` funnel; if it's poor, drop the beat without touching the core flow. |
| Search returns something odd/unsuitable for a first impression | Query is narrowly suggested ("fun fact about birthday cake", "a picture of one") and the cloud prompt's citation/untrusted-content rules apply unchanged; worst case is a dull fact, not a broken flow. |
| Contenteditable + React reconciliation | Body is uncontrolled by design (§2.3): ref'd DOM, `onInput` sync-out only, hydrate once on mount. |

## 2.7 i18n and analytics

- New keys under `onboarding.draft.*` and `onboarding.remix.*` in
  `locales/en.json` + `template.json`, translated for de/es/fr/it/ja/pt
  (repo convention — see the `onboarding.modelSetup.openModelSource`
  precedent). Fictional email content (recipient, subject, suggestion
  lines) are ordinary keys.
- Events per §1.6 through the existing `capture()`/`POST /api/telemetry`
  path (`lib/analytics.ts`).

## 2.8 Testing

- **Unit**: `isRemixTargetAllowed` truth table (null app, excluded name,
  practice on/off, case/whitespace) in the `permission-checks.test` style.
- **E2E** (`apps/electron/tests/app.test.ts:144-210` branch): flow reaches
  `draft`, typing into the body enables Continue, `remix` renders the
  non-interactive variant under `isE2E`, finish completes and lands on
  `/today`, `remix:set-practice-target(false)` observed on teardown.
- **Prompt/route tests**: none needed — no server, schema, prompt, or cloud
  changes in this feature at all.
- **Manual matrix**: macOS (Fn+Control, packaged app name "Freestyle" and
  dev "Electron"), Windows, Linux X11 + Wayland (expect the fallback path
  where the remix listener is unavailable); hold-to-speak remix lands in
  the draft; typed follow-up from the chat card (`remix:recapture` now
  re-anchors on our window); undo; the third beat on a cloud account (fact
  text and inline image both land in the contenteditable; caps respected
  on a huge image URL); usage-429; no-LLM fallback; dev-menu "Reset
  Onboarding" round-trip.

## 2.9 File-by-file change list

All changes are in `apps/electron`. **Zero** changes to `apps/server`,
schema, validations, prompts, or the cloud repo.

| File | Change |
|---|---|
| `src/main/remix-target.ts` | new — `isRemixTargetAllowed` pure helper |
| `src/main/index.ts` | practice flag + IPC (§2.2); helper at the 3 gates; skip `activateAnchorApp` in practice; `remix:practice-delivered` emit ×2; forward `remix:down/up` to settings window; bar creation deferred past onboarding |
| `src/preload/index.ts` / `index.d.ts` | `setRemixPracticeTarget`, `onRemixPracticeDelivered`, `onRemixDown`, `onRemixUp` |
| `src/renderer/src/onboarding.tsx` | step enum `draft`/`remix`, lifted `draftBody`, `DraftStep`, `RemixStep`, transitions, analytics |
| `src/renderer/src/components/onboarding/email-draft.tsx` | new — Gmail compose mockup (contenteditable body with sync-out, inline image support, stages, Send) |
| `src/renderer/src/components/onboarding/coach-strip.tsx` | new — keycaps/status/waveform extracted from `tutorial-demo.tsx`, event-source parameterized |
| `src/renderer/src/components/tutorial-demo.tsx` | slimmed to consume the extracted pieces; Today-page scripted demo unchanged |
| `src/renderer/src/locales/*.json` | `onboarding.draft.*`, `onboarding.remix.*` |
| `tests/app.test.ts` (+ fixtures) | new-flow coverage (§2.8) |
| `src/main/remix-target.test.ts` (or tests dir per convention) | unit tests |

## 2.10 Open questions

1. **Send as the finish** — is the fake Send too cute, or exactly the
   payoff we want? (Spec assumes yes; the quiet finish link keeps it
   honest.)
2. **Suggested instructions** — final wording for both beats, and whether
   to show them as clickable chips the user can also just read aloud.
   (The third-beat query is deliberately narrow; broadening it trades
   safety of the first impression for expressiveness.)
3. **AX enablement during practice** (`setAccessibilitySupportEnabled`) —
   pursue only if manual QA shows the canvas path feeling clumsy.
